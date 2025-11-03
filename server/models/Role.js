import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: ''
  },
  permissions: {
    type: [String],
    default: []
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  priority: {
    type: Number,
    default: 0
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  active: {
    type: Boolean,
    default: true
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
roleSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastRole = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastRole ? lastRole.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Check if role has permission
roleSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission) || this.permissions.includes('*');
};

// Remove sensitive data from JSON output
roleSchema.methods.toJSON = function() {
  const roleObject = this.toObject();
  delete roleObject._id;
  delete roleObject.__v;
  return roleObject;
};

const Role = mongoose.model('Role', roleSchema);

export default Role;

