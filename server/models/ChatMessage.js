import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  userUid: {
    type: Number,
    required: [true, 'User UID is required']
  },
  username: {
    type: String,
    required: true
  },
  userBadge: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  deleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
chatMessageSchema.pre('save', async function(next) {
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

// Remove sensitive data from JSON output
chatMessageSchema.methods.toJSON = function() {
  const messageObject = this.toObject();
  delete messageObject._id;
  delete messageObject.__v;
  return messageObject;
};

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;

