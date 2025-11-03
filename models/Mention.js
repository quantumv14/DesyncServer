import mongoose from 'mongoose';

const mentionSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  mentionedUid: {
    type: Number,
    required: [true, 'Mentioned user ID is required']
  },
  mentionedByUid: {
    type: Number,
    required: [true, 'Mentioning user ID is required']
  },
  contentType: {
    type: String,
    enum: ['thread', 'post', 'message'],
    required: true
  },
  contentId: {
    type: Number,
    required: true
  },
  threadId: {
    type: Number,
    default: null
  },
  content: {
    type: String,
    required: true,
    maxlength: 500
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: String,
    default: null
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
mentionSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastMention = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastMention ? lastMention.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Mark as read
mentionSchema.methods.markAsRead = function() {
  this.read = true;
  this.readAt = new Date().toISOString();
  return this.save();
};

// Remove sensitive data from JSON output
mentionSchema.methods.toJSON = function() {
  const mentionObject = this.toObject();
  delete mentionObject._id;
  delete mentionObject.__v;
  return mentionObject;
};

const Mention = mongoose.model('Mention', mentionSchema);

export default Mention;

