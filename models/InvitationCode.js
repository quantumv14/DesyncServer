import mongoose from 'mongoose';

const invitationCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Invitation code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [4, 'Code must be at least 4 characters'],
    maxlength: [20, 'Code cannot exceed 20 characters']
  },
  createdBy: {
    type: Number,
    required: [true, 'Creator UID is required']
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  expiresAt: {
    type: String,
    required: [true, 'Expiration date is required']
  },
  used: {
    type: Boolean,
    default: false
  },
  usedBy: {
    type: Number,
    default: null
  },
  usedAt: {
    type: String,
    default: null
  },
  maxUses: {
    type: Number,
    default: 1,
    min: 1
  },
  currentUses: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  versionKey: false
});

// Check if code is valid (not expired and not fully used)
invitationCodeSchema.methods.isValid = function() {
  const now = new Date();
  const expiryDate = new Date(this.expiresAt);
  
  return !this.used && 
         this.currentUses < this.maxUses && 
         now < expiryDate;
};

// Mark code as used
invitationCodeSchema.methods.markAsUsed = function(userId) {
  this.currentUses += 1;
  
  if (this.currentUses >= this.maxUses) {
    this.used = true;
    this.usedBy = userId;
    this.usedAt = new Date().toISOString();
  }
  
  return this.save();
};

// Check if code is expired
invitationCodeSchema.methods.isExpired = function() {
  const now = new Date();
  const expiryDate = new Date(this.expiresAt);
  return now >= expiryDate;
};

// Generate random invitation code
invitationCodeSchema.statics.generateCode = function(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Remove sensitive data from JSON output
invitationCodeSchema.methods.toJSON = function() {
  const codeObject = this.toObject();
  delete codeObject._id;
  delete codeObject.__v;
  return codeObject;
};

const InvitationCode = mongoose.model('InvitationCode', invitationCodeSchema);

export default InvitationCode;