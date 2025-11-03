import mongoose from 'mongoose';

const userRoleSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  userUid: {
    type: Number,
    required: [true, 'User UID is required']
  },
  roleId: {
    type: Number,
    required: [true, 'Role ID is required']
  },
  assignedAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  assignedBy: {
    type: Number,
    default: null
  },
  expiresAt: {
    type: String,
    default: null
  },
  active: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
userRoleSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastUserRole = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastUserRole ? lastUserRole.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Check if role is expired
userRoleSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date(this.expiresAt) < new Date();
};

// Check if role is valid (active and not expired)
userRoleSchema.methods.isValid = function() {
  return this.active && !this.isExpired();
};

// Extend expiration
userRoleSchema.methods.extend = function(days) {
  const currentExpiry = this.expiresAt ? new Date(this.expiresAt) : new Date();
  const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
  this.expiresAt = newExpiry.toISOString();
  return this.save();
};

// Remove sensitive data from JSON output
userRoleSchema.methods.toJSON = function() {
  const userRoleObject = this.toObject();
  delete userRoleObject._id;
  delete userRoleObject.__v;
  return userRoleObject;
};

const UserRole = mongoose.model('UserRole', userRoleSchema);

export default UserRole;

