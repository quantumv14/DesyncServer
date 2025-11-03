import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  conversationId: {
    type: Number,
    required: [true, 'Conversation ID is required']
  },
  senderUid: {
    type: Number,
    required: [true, 'Sender UID is required']
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [5000, 'Message cannot exceed 5000 characters']
  },
  readBy: [{
    uid: Number,
    readAt: String
  }],
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: String,
    default: null
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
messageSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastMessage = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastMessage ? lastMessage.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Mark as read by a user
messageSchema.methods.markAsReadBy = function(uid) {
  const alreadyRead = this.readBy.find(r => r.uid === uid);
  if (!alreadyRead) {
    this.readBy.push({
      uid,
      readAt: new Date().toISOString()
    });
  }
  return this.save();
};

// Check if read by user
messageSchema.methods.isReadBy = function(uid) {
  return this.readBy.some(r => r.uid === uid);
};

// Remove sensitive data from JSON output
messageSchema.methods.toJSON = function() {
  const messageObject = this.toObject();
  delete messageObject._id;
  delete messageObject.__v;
  return messageObject;
};

const Message = mongoose.model('Message', messageSchema);

export default Message;

