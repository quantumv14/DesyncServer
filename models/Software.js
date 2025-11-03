import mongoose from 'mongoose';

const softwareSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Software name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'BTC', 'ETH']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Cheat', 'Tool', 'Script', 'Mod', 'Other']
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  downloadUrl: {
    type: String,
    default: null
  },
  imageUrl: {
    type: String,
    default: null
  },
  features: {
    type: [String],
    default: []
  },
  requirements: {
    type: [String],
    default: []
  },
  compatibility: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Discontinued', 'Beta'],
    default: 'Active'
  },
  createdBy: {
    type: Number,
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
  totalSales: {
    type: Number,
    default: 0,
    min: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
softwareSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastSoftware = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastSoftware ? lastSoftware.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Update sales count
softwareSchema.methods.incrementSales = function() {
  this.totalSales += 1;
  this.updatedAt = new Date().toISOString();
  return this.save();
};

// Update rating
softwareSchema.methods.updateRating = function(newRating, reviewCount) {
  this.rating = newRating;
  this.reviewCount = reviewCount;
  this.updatedAt = new Date().toISOString();
  return this.save();
};

// Check if software is purchasable
softwareSchema.methods.isPurchasable = function() {
  return this.status === 'Active' || this.status === 'Beta';
};

// Remove sensitive data from JSON output
softwareSchema.methods.toJSON = function() {
  const softwareObject = this.toObject();
  delete softwareObject._id;
  delete softwareObject.__v;
  return softwareObject;
};

const Software = mongoose.model('Software', softwareSchema);

export default Software;