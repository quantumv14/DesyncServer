import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  userUid: {
    type: Number,
    required: [true, 'User UID is required']
  },
  type: {
    type: String,
    enum: ['mention', 'pm', 'reply', 'reaction', 'purchase', 'system', 'token_reward'],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  relatedId: {
    type: Number,
    default: null
  },
  fromUserId: {
    type: Number,
    default: null
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: String,
    default: null
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
notificationSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastNotification = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastNotification ? lastNotification.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Mark as read
notificationSchema.methods.markAsRead = function() {
  this.read = true;
  this.readAt = new Date().toISOString();
  return this.save();
};

// Create notification helper
notificationSchema.statics.createNotification = async function(userUid, type, title, message, data = {}, relatedId = null, fromUserId = null) {
  const notification = new this({
    userUid,
    type,
    title,
    message,
    data,
    relatedId,
    fromUserId
  });
  return await notification.save();
};

// Remove sensitive data from JSON output
notificationSchema.methods.toJSON = function() {
  const notificationObject = this.toObject();
  delete notificationObject._id;
  delete notificationObject.__v;
  return notificationObject;
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;

