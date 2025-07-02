import Message from '../models/Message.js';
import Room from '../models/Room.js';
import User from '../models/User.js';
import Call from '../models/Call.js';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

const activeUsers = new Map();
const activeCalls = new Map();

export const handleSocketConnection = (socket, io) => {
  console.log(`User connected: ${socket.user.username} (${socket.userId})`);

  // Add user to active users
  activeUsers.set(socket.userId, {
    socketId: socket.id,
    user: socket.user,
    status: 'online'
  });

  // Update user online status
  updateUserOnlineStatus(socket.userId, true);

  // Join user to their rooms
  joinUserRooms(socket);

  // Notify other users that this user is online
  socket.broadcast.emit('user_online', {
    userId: socket.userId,
    username: socket.user.username
  });

  // Handle joining a room
  socket.on('join_room', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);

      if (!room || !room.isMember(socket.userId)) {
        socket.emit('error', { message: 'Access denied to room' });
        return;
      }

      socket.join(roomId);
      socket.emit('joined_room', { roomId });

      // Notify other room members
      socket.to(roomId).emit('user_joined_room', {
        userId: socket.userId,
        username: socket.user.username,
        roomId
      });

    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Handle sending messages
  socket.on('send_message', async (data) => {
    try {
      const { roomId, content, encryptedContent, type = 'text', replyTo } = data;

      const room = await Room.findById(roomId);
      if (!room || !room.isMember(socket.userId)) {
        socket.emit('error', { message: 'Access denied to room' });
        return;
      }

      const message = new Message({
        content,
        encryptedContent,
        sender: socket.userId,
        room: roomId,
        type,
        replyTo
      });

      await message.save();
      await message.populate('sender', 'username avatar');

      // Update room activity
      await room.updateActivity();

      // Emit message to room members
      io.to(roomId).emit('new_message', message);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle message reactions
  socket.on('add_reaction', async (data) => {
    try {
      const { messageId, emoji } = data;
      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      await message.addReaction(socket.userId, emoji);
      await message.populate('reactions.user', 'username');

      io.to(message.room.toString()).emit('reaction_added', {
        messageId,
        reactions: message.reactions
      });

    } catch (error) {
      console.error('Add reaction error:', error);
      socket.emit('error', { message: 'Failed to add reaction' });
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    const { roomId } = data;
    socket.to(roomId).emit('user_typing', {
      userId: socket.userId,
      username: socket.user.username,
      roomId
    });
  });

  socket.on('typing_stop', (data) => {
    const { roomId } = data;
    socket.to(roomId).emit('user_stopped_typing', {
      userId: socket.userId,
      roomId
    });
  });

  // Handle video call initiation
  socket.on('initiate_call', async (data) => {
    try {
      const { roomId, type = 'video' } = data;
      const room = await Room.findById(roomId);

      if (!room || !room.isMember(socket.userId)) {
        socket.emit('error', { message: 'Access denied to room' });
        return;
      }

      const callId = uuidv4();
      const call = new Call({
        callId,
        room: roomId,
        initiator: socket.userId,
        type,
        status: 'initiated'
      });

      await call.save();
      activeCalls.set(callId, {
        call,
        participants: new Map()
      });

      // Notify room members about the call
      socket.to(roomId).emit('incoming_call', {
        callId,
        initiator: {
          id: socket.userId,
          username: socket.user.username
        },
        type,
        roomId
      });

      socket.emit('call_initiated', { callId });

    } catch (error) {
      console.error('Initiate call error:', error);
      socket.emit('error', { message: 'Failed to initiate call' });
    }
  });

  // Handle call response
  socket.on('call_response', async (data) => {
    try {
      const { callId, response } = data; // response: 'accept' or 'reject'
      const callData = activeCalls.get(callId);

      if (!callData) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found in database' });
        return;
      }

      if (response === 'accept') {
        await call.addParticipant(socket.userId, 'joined');
        callData.participants.set(socket.userId, socket.id);

        if (call.status === 'initiated') {
          await call.startCall();
        }

        // Notify call participants
        const initiatorSocket = activeUsers.get(call.initiator.toString());
        if (initiatorSocket) {
          io.to(initiatorSocket.socketId).emit('call_accepted', {
            callId,
            participant: {
              id: socket.userId,
              username: socket.user.username
            }
          });
        }

        socket.emit('call_joined', { callId });

      } else if (response === 'reject') {
        await call.addParticipant(socket.userId, 'rejected');

        const initiatorSocket = activeUsers.get(call.initiator.toString());
        if (initiatorSocket) {
          io.to(initiatorSocket.socketId).emit('call_rejected', {
            callId,
            participant: {
              id: socket.userId,
              username: socket.user.username
            }
          });
        }
      }

    } catch (error) {
      console.error('Call response error:', error);
      socket.emit('error', { message: 'Failed to respond to call' });
    }
  });

  // Handle WebRTC signaling
  socket.on('webrtc_offer', (data) => {
    const { callId, offer, targetUserId } = data;
    const targetUser = activeUsers.get(targetUserId);

    if (targetUser) {
      io.to(targetUser.socketId).emit('webrtc_offer', {
        callId,
        offer,
        fromUserId: socket.userId
      });
    }
  });

  socket.on('webrtc_answer', (data) => {
    const { callId, answer, targetUserId } = data;
    const targetUser = activeUsers.get(targetUserId);

    if (targetUser) {
      io.to(targetUser.socketId).emit('webrtc_answer', {
        callId,
        answer,
        fromUserId: socket.userId
      });
    }
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { callId, candidate, targetUserId } = data;
    const targetUser = activeUsers.get(targetUserId);

    if (targetUser) {
      io.to(targetUser.socketId).emit('webrtc_ice_candidate', {
        callId,
        candidate,
        fromUserId: socket.userId
      });
    }
  });

  // Handle call end
  socket.on('end_call', async (data) => {
    try {
      const { callId } = data;
      const callData = activeCalls.get(callId);

      if (callData) {
        const call = await Call.findOne({ callId });
        if (call) {
          await call.endCall();
        }

        // Notify all participants
        callData.participants.forEach((socketId, userId) => {
          io.to(socketId).emit('call_ended', { callId });
        });

        activeCalls.delete(callId);
      }

    } catch (error) {
      console.error('End call error:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.user.username} (${socket.userId})`);

    // Remove from active users
    activeUsers.delete(socket.userId);

    // Update user online status
    await updateUserOnlineStatus(socket.userId, false);

    // Notify other users that this user is offline
    socket.broadcast.emit('user_offline', {
      userId: socket.userId,
      username: socket.user.username
    });

    // Handle active calls
    activeCalls.forEach(async (callData, callId) => {
      if (callData.participants.has(socket.userId)) {
        callData.participants.delete(socket.userId);

        // If no participants left, end the call
        if (callData.participants.size === 0) {
          const call = await Call.findOne({ callId });
          if (call) {
            await call.endCall();
          }
          activeCalls.delete(callId);
        }

        // Notify remaining participants
        callData.participants.forEach((socketId) => {
          io.to(socketId).emit('participant_left', {
            callId,
            userId: socket.userId
          });
        });
      }
    });
  });
};

// Helper functions
async function joinUserRooms(socket) {
  try {
    const user = await User.findById(socket.userId).populate('rooms');
    user.rooms.forEach(room => {
      socket.join(room._id.toString());
    });
  } catch (error) {
    console.error('Join user rooms error:', error);
  }
}

async function updateUserOnlineStatus(userId, isOnline) {
  try {
    await User.findByIdAndUpdate(userId, {
      isOnline,
      lastSeen: new Date()
    });
  } catch (error) {
    console.error('Update user status error:', error);
  }
}