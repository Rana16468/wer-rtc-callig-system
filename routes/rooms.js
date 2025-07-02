import express from 'express';
import { body, validationResult } from 'express-validator';
import Room from '../models/Room.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import CryptoJS from 'crypto-js';

const router = express.Router();

// Get user's rooms
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rooms = await Room.find({
      'members.user': req.userId,
      isActive: true
    })
    .populate('creator', 'username avatar')
    .populate('members.user', 'username avatar isOnline lastSeen')
    .sort({ lastActivity: -1 });

    res.json({ rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new room
router.post('/', authenticateToken, [
  body('name')
    .isLength({ min: 1, max: 50 })
    .withMessage('Room name must be between 1 and 50 characters'),
  body('type')
    .isIn(['public', 'private', 'direct'])
    .withMessage('Invalid room type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { name, description, type, maxMembers } = req.body;

    // Generate encryption key for the room
    const encryptionKey = CryptoJS.lib.WordArray.random(256/8).toString();

    const room = new Room({
      name,
      description,
      type,
      creator: req.userId,
      members: [{
        user: req.userId,
        role: 'admin',
        encryptionKey
      }],
      settings: {
        maxMembers: maxMembers || 100
      }
    });

    await room.save();
    await room.populate('creator', 'username avatar');
    await room.populate('members.user', 'username avatar isOnline lastSeen');

    // Add room to user's rooms
    await User.findByIdAndUpdate(req.userId, {
      $push: { rooms: room._id }
    });

    res.status(201).json({ 
      message: 'Room created successfully', 
      room 
    });

  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get room details
router.get('/:roomId', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId)
      .populate('creator', 'username avatar')
      .populate('members.user', 'username avatar isOnline lastSeen');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is a member
    if (!room.isMember(req.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ room });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Join room
router.post('/:roomId/join', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.isMember(req.userId)) {
      return res.status(400).json({ message: 'Already a member of this room' });
    }

    if (room.type === 'private' && !req.body.inviteCode) {
      return res.status(403).json({ message: 'Invite code required for private rooms' });
    }

    // Generate encryption key for the user
    const encryptionKey = CryptoJS.lib.WordArray.random(256/8).toString();

    await room.addMember(req.userId, encryptionKey);
    await User.findByIdAndUpdate(req.userId, {
      $push: { rooms: room._id }
    });

    await room.populate('members.user', 'username avatar isOnline lastSeen');

    res.json({ 
      message: 'Joined room successfully', 
      room 
    });

  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Leave room
router.post('/:roomId/leave', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!room.isMember(req.userId)) {
      return res.status(400).json({ message: 'Not a member of this room' });
    }

    await room.removeMember(req.userId);
    await User.findByIdAndUpdate(req.userId, {
      $pull: { rooms: room._id }
    });

    res.json({ message: 'Left room successfully' });

  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get room messages
router.get('/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!room.isMember(req.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({ 
      room: req.params.roomId,
      isDeleted: false 
    })
    .populate('sender', 'username avatar')
    .populate('replyTo', 'content sender')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    res.json({ messages: messages.reverse() });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update room settings
router.patch('/:roomId', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const userRole = room.getMemberRole(req.userId);
    if (!['admin', 'moderator'].includes(userRole)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const allowedUpdates = ['name', 'description', 'settings'];
    const updates = Object.keys(req.body);
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
      return res.status(400).json({ message: 'Invalid updates' });
    }

    updates.forEach(update => {
      if (update === 'settings') {
        room.settings = { ...room.settings, ...req.body.settings };
      } else {
        room[update] = req.body[update];
      }
    });

    await room.save();
    await room.populate('creator', 'username avatar');
    await room.populate('members.user', 'username avatar isOnline lastSeen');

    res.json({ message: 'Room updated successfully', room });

  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;