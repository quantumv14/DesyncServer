import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Category description is required'],
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  icon: {
    type: String,
    default: '📁'
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  order: {
    type: Number,
    default: 0
  },
  threadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  postCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActivity: {
    type: String,
    default: () => new Date().toISOString()
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  createdBy: {
    type: Number,
    required: true
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
categorySchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastCategory = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastCategory ? lastCategory.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Update thread count
categorySchema.methods.updateThreadCount = async function() {
  const Thread = mongoose.model('Thread');
  this.threadCount = await Thread.countDocuments({ categoryId: this.id });
  return this.save();
};

// Update post count
categorySchema.methods.updatePostCount = async function() {
  const Post = mongoose.model('Post');
  const Thread = mongoose.model('Thread');
  
  const threads = await Thread.find({ categoryId: this.id });
  const threadIds = threads.map(t => t.id);
  
  this.postCount = await Post.countDocuments({ threadId: { $in: threadIds } });
  return this.save();
};

// Update last activity
categorySchema.methods.updateLastActivity = function() {
  this.lastActivity = new Date().toISOString();
  return this.save();
};

// Remove sensitive data from JSON output
categorySchema.methods.toJSON = function() {
  const categoryObject = this.toObject();
  delete categoryObject._id;
  delete categoryObject.__v;
  return categoryObject;
};

const Category = mongoose.model('Category', categorySchema);

export default Category;