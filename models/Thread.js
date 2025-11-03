import mongoose from 'mongoose';

const threadSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  categoryId: {
    type: Number,
    required: [true, 'Category ID is required']
  },
  title: {
    type: String,
    required: [true, 'Thread title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  content: {
    type: String,
    required: [true, 'Thread content is required'],
    maxlength: [10000, 'Content cannot exceed 10000 characters']
  },
  authorUid: {
    type: Number,
    required: [true, 'Author UID is required']
  },
  authorUsername: {
    type: String,
    required: true
  },
  authorBadge: {
    type: String,
    required: true
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  updatedAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  lastActivity: {
    type: String,
    default: () => new Date().toISOString()
  },
  lastPostBy: {
    type: Number,
    default: null
  },
  lastPostAt: {
    type: String,
    default: null
  },
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  replies: {
    type: Number,
    default: 0,
    min: 0
  },
  locked: {
    type: Boolean,
    default: false
  },
  pinned: {
    type: Boolean,
    default: false
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: Number,
    default: null
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
threadSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastThread = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastThread ? lastThread.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Update reply count
threadSchema.methods.updateReplyCount = async function() {
  const Post = mongoose.model('Post');
  this.replies = await Post.countDocuments({ threadId: this.id, deleted: false });
  return this.save();
};

// Update last activity
threadSchema.methods.updateLastActivity = function(userId) {
  this.lastActivity = new Date().toISOString();
  this.lastPostBy = userId;
  this.lastPostAt = new Date().toISOString();
  return this.save();
};

// Increment view count
threadSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Lock/unlock thread
threadSchema.methods.toggleLock = function() {
  this.locked = !this.locked;
  return this.save();
};

// Pin/unpin thread
threadSchema.methods.togglePin = function() {
  this.pinned = !this.pinned;
  return this.save();
};

// Soft delete thread
threadSchema.methods.softDelete = function(deletedBy) {
  this.deleted = true;
  this.deletedBy = deletedBy;
  this.deletedAt = new Date().toISOString();
  return this.save();
};

// Restore thread
threadSchema.methods.restore = function() {
  this.deleted = false;
  this.deletedBy = null;
  this.deletedAt = null;
  return this.save();
};

// Remove sensitive data from JSON output
threadSchema.methods.toJSON = function() {
  const threadObject = this.toObject();
  delete threadObject._id;
  delete threadObject.__v;
  return threadObject;
};

const Thread = mongoose.model('Thread', threadSchema);

export default Thread;