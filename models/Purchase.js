import mongoose from 'mongoose';

const purchaseSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  userId: {
    type: Number,
    required: [true, 'User ID is required']
  },
  softwareId: {
    type: Number,
    required: [true, 'Software ID is required']
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: ['Crypto', 'Card', 'PayPal', 'Bank Transfer']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    enum: ['USD', 'EUR', 'BTC', 'ETH']
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded', 'Cancelled'],
    default: 'Pending'
  },
  transactionId: {
    type: String,
    default: null
  },
  stripePaymentId: {
    type: String,
    default: null
  },
  stripeSessionId: {
    type: String,
    default: null
  },
  productSlug: {
    type: String,
    default: null
  },
  duration: {
    type: String,
    default: null
  },
  durationDays: {
    type: Number,
    default: null
  },
  paymentData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  purchaseDate: {
    type: String,
    default: () => new Date().toISOString()
  },
  completedAt: {
    type: String,
    default: null
  },
  refundedAt: {
    type: String,
    default: null
  },
  refundReason: {
    type: String,
    default: null
  },
  downloadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxDownloads: {
    type: Number,
    default: 5,
    min: 1
  },
  lastDownload: {
    type: String,
    default: null
  },
  licenseKey: {
    type: String,
    default: null
  },
  expiresAt: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
purchaseSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastPurchase = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastPurchase ? lastPurchase.id + 1 : 1;
      
      // Generate license key if not provided
      if (!this.licenseKey) {
        this.licenseKey = this.generateLicenseKey();
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Generate license key
purchaseSchema.methods.generateLicenseKey = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) result += '-';
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Complete purchase
purchaseSchema.methods.completePurchase = function(transactionId) {
  this.status = 'Completed';
  this.completedAt = new Date().toISOString();
  if (transactionId) {
    this.transactionId = transactionId;
  }
  return this.save();
};

// Fail purchase
purchaseSchema.methods.failPurchase = function(reason) {
  this.status = 'Failed';
  if (reason) {
    this.notes = reason;
  }
  return this.save();
};

// Refund purchase
purchaseSchema.methods.refundPurchase = function(reason) {
  this.status = 'Refunded';
  this.refundedAt = new Date().toISOString();
  this.refundReason = reason;
  return this.save();
};

// Record download
purchaseSchema.methods.recordDownload = function() {
  if (this.downloadCount >= this.maxDownloads) {
    throw new Error('Download limit exceeded');
  }
  
  this.downloadCount += 1;
  this.lastDownload = new Date().toISOString();
  return this.save();
};

// Check if download is allowed
purchaseSchema.methods.canDownload = function() {
  if (this.status !== 'Completed') return false;
  if (this.downloadCount >= this.maxDownloads) return false;
  if (this.expiresAt && new Date() > new Date(this.expiresAt)) return false;
  return true;
};

// Check if purchase is active
purchaseSchema.methods.isActive = function() {
  if (this.status !== 'Completed') return false;
  if (this.expiresAt && new Date() > new Date(this.expiresAt)) return false;
  return true;
};

// Remove sensitive data from JSON output
purchaseSchema.methods.toJSON = function() {
  const purchaseObject = this.toObject();
  delete purchaseObject._id;
  delete purchaseObject.__v;
  delete purchaseObject.paymentData; // Hide sensitive payment data
  return purchaseObject;
};

const Purchase = mongoose.model('Purchase', purchaseSchema);

export default Purchase;