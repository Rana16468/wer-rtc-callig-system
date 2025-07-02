import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    unique: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  initiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['invited', 'joined', 'left', 'rejected'],
      default: 'invited'
    }
  }],
  type: {
    type: String,
    enum: ['audio', 'video'],
    required: true
  },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'active', 'ended', 'missed'],
    default: 'initiated'
  },
  startedAt: {
    type: Date,
    default: null
  },
  endedAt: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: 0 // in seconds
  },
  settings: {
    recordingEnabled: {
      type: Boolean,
      default: false
    },
    screenSharingEnabled: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Index for better query performance
callSchema.index({ room: 1, status: 1 });
callSchema.index({ 'participants.user': 1 });

// Add participant to call
callSchema.methods.addParticipant = function(userId, status = 'invited') {
  const existingParticipant = this.participants.find(p => 
    p.user.toString() === userId.toString()
  );
  
  if (existingParticipant) {
    existingParticipant.status = status;
    if (status === 'joined') {
      existingParticipant.joinedAt = new Date();
    }
  } else {
    this.participants.push({
      user: userId,
      status,
      joinedAt: status === 'joined' ? new Date() : null
    });
  }
  
  return this.save();
};

// Remove participant from call
callSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString()
  );
  
  if (participant) {
    participant.status = 'left';
    participant.leftAt = new Date();
  }
  
  return this.save();
};

// Start call
callSchema.methods.startCall = function() {
  this.status = 'active';
  this.startedAt = new Date();
  return this.save();
};

// End call
callSchema.methods.endCall = function() {
  this.status = 'ended';
  this.endedAt = new Date();
  
  if (this.startedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  
  // Mark all active participants as left
  this.participants.forEach(participant => {
    if (participant.status === 'joined') {
      participant.status = 'left';
      participant.leftAt = this.endedAt;
    }
  });
  
  return this.save();
};

export default mongoose.model('Call', callSchema);