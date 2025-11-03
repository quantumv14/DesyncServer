import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  threadId: {
    type: Number,
    required: [true, 'Thread ID is required']
  },
  content: {
    type: String,
    required: [true, 'Post content is required'],
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
  edited: {
    type: Boolean,
    default: false
  },
  editedBy: {
    type: Number,
    default: null
  },
  editedAt: {
    type: String,
    default: null
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
  },
  reactions: {
    type: Map,
    of: [Number], // Array of user IDs who reacted
    default: new Map()
  },
  reactionCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
postSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastPost = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastPost ? lastPost.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Add reaction
postSchema.methods.addReaction = function(emoji, userId) {
  if (!this.reactions.has(emoji)) {
    this.reactions.set(emoji, []);
  }
  
  const users = this.reactions.get(emoji);
  if (!users.includes(userId)) {
    users.push(userId);
    this.reactions.set(emoji, users);
    this.updateReactionCount();
  }
  
  return this.save();
};

// Remove reaction
postSchema.methods.removeReaction = function(emoji, userId) {
  if (this.reactions.has(emoji)) {
    const users = this.reactions.get(emoji);
    const index = users.indexOf(userId);
    
    if (index > -1) {
      users.splice(index, 1);
      
      if (users.length === 0) {
        this.reactions.delete(emoji);
      } else {
        this.reactions.set(emoji, users);
      }
      
      this.updateReactionCount();
    }
  }
  
  return this.save();
};

// Update reaction count
postSchema.methods.updateReactionCount = function() {
  let count = 0;
  for (const users of this.reactions.values()) {
    count += users.length;
  }
  this.reactionCount = count;
};

// Edit post
postSchema.methods.editPost = function(newContent, editedBy) {
  this.content = newContent;
  this.edited = true;
  this.editedBy = editedBy;
  this.editedAt = new Date().toISOString();
  this.updatedAt = new Date().toISOString();
  return this.save();
};

// Soft delete post
postSchema.methods.softDelete = function(deletedBy) {
  this.deleted = true;
  this.deletedBy = deletedBy;
  this.deletedAt = new Date().toISOString();
  return this.save();
};

// Restore post
postSchema.methods.restore = function() {
  this.deleted = false;
  this.deletedBy = null;
  this.deletedAt = null;
  return this.save();
};

// Remove sensitive data from JSON output
postSchema.methods.toJSON = function() {
  const postObject = this.toObject();
  delete postObject._id;
  delete postObject.__v;
  
  // Convert Map to Object for JSON serialization
  if (postObject.reactions instanceof Map) {
    postObject.reactions = Object.fromEntries(postObject.reactions);
  }
  
  return postObject;
};

const Post = mongoose.model('Post', postSchema);

export default Post;