import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  participants: [{
    type: Number,
    required: true
  }],
  lastMessageAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  lastMessagePreview: {
    type: String,
    default: ''
  },
  lastMessageBy: {
    type: Number,
    default: null
  },
  unreadCount: {
    type: Map,
    of: Number, // uid -> unread count
    default: new Map()
  },
  archived: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
conversationSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastConversation = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastConversation ? lastConversation.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Find conversation between two users
conversationSchema.statics.findBetweenUsers = function(uid1, uid2) {
  return this.findOne({
    participants: { $all: [uid1, uid2], $size: 2 }
  });
};

// Update last message info
conversationSchema.methods.updateLastMessage = function(message, senderUid) {
  this.lastMessageAt = new Date().toISOString();
  this.lastMessagePreview = message.substring(0, 100);
  this.lastMessageBy = senderUid;
  
  // Increment unread count for all participants except sender
  this.participants.forEach(uid => {
    if (uid !== senderUid) {
      const currentCount = this.unreadCount.get(uid.toString()) || 0;
      this.unreadCount.set(uid.toString(), currentCount + 1);
    }
  });
  
  return this.save();
};

// Mark as read for a user
conversationSchema.methods.markAsRead = function(uid) {
  this.unreadCount.set(uid.toString(), 0);
  return this.save();
};

// Remove sensitive data from JSON output
conversationSchema.methods.toJSON = function() {
  const conversationObject = this.toObject();
  delete conversationObject._id;
  delete conversationObject.__v;
  return conversationObject;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;

