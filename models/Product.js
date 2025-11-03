import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
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
  title: {
    type: String,
    required: [true, 'Product title is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  basePrice: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  durations: [{
    duration: String, // '1week', '1month', '3months', '1year', 'lifetime'
    days: Number,
    price: Number,
    stripePriceId: String
  }],
  features: {
    type: [String],
    default: []
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  roleId: {
    type: Number,
    default: null
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  updatedAt: {
    type: String,
    default: () => new Date().toISOString()
  }
}, {
  timestamps: true,
  versionKey: false
});

// Auto-increment id field
productSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastProduct = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastProduct ? lastProduct.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Get price for duration
productSchema.methods.getPriceForDuration = function(duration) {
  const durationObj = this.durations.find(d => d.duration === duration);
  return durationObj ? durationObj.price : this.basePrice;
};

// Remove sensitive data from JSON output
productSchema.methods.toJSON = function() {
  const productObject = this.toObject();
  delete productObject._id;
  delete productObject.__v;
  return productObject;
};

const Product = mongoose.model('Product', productSchema);

export default Product;

