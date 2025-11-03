import mongoose from 'mongoose';
import validator from 'validator';

const userSchema = new mongoose.Schema({
  uid: {
    type: Number,
    unique: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: {
      validator: function(email) {
        const allowedDomains = ['gmail.com', 'hotmail.com', 'outlook.com'];
        return allowedDomains.some(domain => email.endsWith(`@${domain}`));
      },
      message: 'Email must be from Gmail, Hotmail, or Outlook'
    }
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  badge: {
    type: String,
    enum: ['Owner', 'Admin', 'Moderator', 'Support', 'Premium', 'Known', 'Member'],
    default: 'Member'
  },
  joinDate: {
    type: String,
    default: () => new Date().toISOString()
  },
  lastSeen: {
    type: String,
    default: () => new Date().toISOString()
  },
  ipAddress: {
    type: String,
    default: '0.0.0.0'
  },
  messages: {
    type: Number,
    default: 0,
    min: 0
  },
  reactionScore: {
    type: Number,
    default: 0
  },
  aboutMe: {
    type: String,
    default: '',
    maxlength: 1000
  },
  privateMessages: [{
    id: Number,
    senderId: Number,
    receiverId: Number,
    subject: String,
    content: String,
    read: { type: Boolean, default: false },
    readAt: String,
    createdAt: String
  }],
  notifications: [{
    id: Number,
    type: { type: String, enum: ['mention', 'pm', 'reaction', 'reply'] },
    message: String,
    read: { type: Boolean, default: false },
    createdAt: String,
    relatedId: Number, // Thread ID, Post ID, etc.
    fromUserId: Number
  }],
  reports: [{
    id: Number,
    type: { type: String, enum: ['thread', 'post', 'user'] },
    targetId: Number, // Thread ID, Post ID, or User ID
    reason: String,
    description: String,
    reportedBy: Number,
    status: { type: String, enum: ['pending', 'reviewed', 'resolved', 'dismissed'], default: 'pending' },
    createdAt: String,
    reviewedBy: Number,
    reviewedAt: String,
    action: String // What action was taken
  }],
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  banned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String,
    default: null
  },
  bannedAt: {
    type: String,
    default: null
  },
  bannedBy: {
    type: Number,
    default: null
  },
  inventory: [{
    id: { type: Number, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['invite', 'reward', 'badge'], required: true },
    description: { type: String, required: true },
    expiresAt: { type: String, default: null },
    createdAt: { type: String, default: () => new Date().toISOString() },
    used: { type: Boolean, default: false },
    usedAt: { type: String, default: null }
  }]
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment uid field
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.uid) {
    try {
      const lastUser = await this.constructor.findOne({}, {}, { sort: { uid: -1 } });
      this.uid = lastUser ? lastUser.uid + 1 : 1;
      console.log(`Assigning UID ${this.uid} to user ${this.username}`);
    } catch (error) {
      console.error('Error in UID auto-increment:', error);
      return next(error);
    }
  }
  next();
});

// Update lastSeen on login
userSchema.methods.updateLastSeen = function(ipAddress) {
  this.lastSeen = new Date().toISOString();
  if (ipAddress) {
    this.ipAddress = ipAddress;
  }
  return this.save();
};

// Check if user can perform admin actions
userSchema.methods.isAdmin = function() {
  return ['Owner', 'Admin'].includes(this.badge);
};

// Check if user can moderate
userSchema.methods.isModerator = function() {
  return ['Owner', 'Admin', 'Moderator'].includes(this.badge);
};

// Check if user has support privileges
userSchema.methods.isSupport = function() {
  return ['Owner', 'Admin', 'Moderator', 'Support'].includes(this.badge);
};

// Increment message count
userSchema.methods.incrementMessages = function() {
  this.messages += 1;
  return this.save();
};

// Add points
userSchema.methods.addPoints = function(points) {
  this.points += points;
  return this.save();
};

// Ban user
userSchema.methods.banUser = function(reason, bannedBy) {
  this.banned = true;
  this.banReason = reason;
  this.bannedAt = new Date().toISOString();
  this.bannedBy = bannedBy;
  return this.save();
};

// Unban user
userSchema.methods.unbanUser = function() {
  this.banned = false;
  this.banReason = null;
  this.bannedAt = null;
  this.bannedBy = null;
  return this.save();
};

// Change user rank/badge
userSchema.methods.changeRank = function(newBadge) {
  const validBadges = ['Owner', 'Admin', 'Moderator', 'Support', 'Premium', 'Known', 'Member'];
  if (validBadges.includes(newBadge)) {
    this.badge = newBadge;
    return this.save();
  }
  throw new Error('Invalid badge');
};

// Inventory management methods
userSchema.methods.addInventoryItem = function(name, type, description, expiresAt = null) {
  const newId = this.inventory.length > 0 ? Math.max(...this.inventory.map(item => item.id)) + 1 : 1;
  const newItem = {
    id: newId,
    name,
    type,
    description,
    expiresAt,
    createdAt: new Date().toISOString(),
    used: false,
    usedAt: null
  };
  this.inventory.push(newItem);
  return this.save();
};

userSchema.methods.useInventoryItem = function(itemId) {
  const item = this.inventory.find(item => item.id === itemId);
  if (!item) {
    throw new Error('Item not found in inventory');
  }
  if (item.used) {
    throw new Error('Item already used');
  }
  if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
    throw new Error('Item has expired');
  }
  item.used = true;
  item.usedAt = new Date().toISOString();
  return this.save();
};

userSchema.methods.getActiveInventoryItems = function() {
  const now = new Date();
  return this.inventory.filter(item => 
    !item.used && 
    (!item.expiresAt || new Date(item.expiresAt) > now)
  );
};

userSchema.methods.cleanExpiredItems = function() {
  const now = new Date();
  this.inventory = this.inventory.filter(item => 
    !item.expiresAt || new Date(item.expiresAt) > now
  );
  return this.save();
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject._id;
  delete userObject.__v;
  return userObject;
};

const User = mongoose.model('User', userSchema);

export default User;