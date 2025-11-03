import mongoose from 'mongoose';

const tokenWalletSchema = new mongoose.Schema({
  userUid: {
    type: Number,
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  lastDailyReward: {
    type: String,
    default: null
  },
  currentStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  longestStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  weeklyRewardsClaimed: {
    type: Number,
    default: 0
  },
  transactions: [{
    id: Number,
    type: { type: String, enum: ['earn', 'spend', 'admin_add', 'admin_remove'] },
    amount: Number,
    reason: String,
    relatedId: Number,
    createdAt: String
  }],
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  }
}, {
  timestamps: true,
  versionKey: false
});

// Add tokens
tokenWalletSchema.methods.addTokens = function(amount, reason, relatedId = null) {
  this.balance += amount;
  this.totalEarned += amount;
  
  const transactionId = this.transactions.length > 0 
    ? Math.max(...this.transactions.map(t => t.id)) + 1 
    : 1;
  
  this.transactions.push({
    id: transactionId,
    type: 'earn',
    amount,
    reason,
    relatedId,
    createdAt: new Date().toISOString()
  });
  
  return this.save();
};

// Spend tokens
tokenWalletSchema.methods.spendTokens = function(amount, reason, relatedId = null) {
  if (this.balance < amount) {
    throw new Error('Insufficient tokens');
  }
  
  this.balance -= amount;
  this.totalSpent += amount;
  
  const transactionId = this.transactions.length > 0 
    ? Math.max(...this.transactions.map(t => t.id)) + 1 
    : 1;
  
  this.transactions.push({
    id: transactionId,
    type: 'spend',
    amount,
    reason,
    relatedId,
    createdAt: new Date().toISOString()
  });
  
  return this.save();
};

// Claim daily reward
tokenWalletSchema.methods.claimDailyReward = function() {
  const today = new Date().toISOString().split('T')[0];
  const lastRewardDate = this.lastDailyReward ? this.lastDailyReward.split('T')[0] : null;
  
  // Check if already claimed today
  if (lastRewardDate === today) {
    throw new Error('Daily reward already claimed');
  }
  
  // Check if streak continues
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  if (lastRewardDate === yesterday) {
    this.currentStreak += 1;
  } else if (lastRewardDate !== today) {
    // Streak broken
    this.currentStreak = 1;
  }
  
  // Update longest streak
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
  }
  
  // Award tokens
  const baseReward = 1;
  this.addTokens(baseReward, 'Daily login reward');
  
  this.lastDailyReward = new Date().toISOString();
  
  // Check for weekly bonus (7 day streak)
  if (this.currentStreak % 7 === 0) {
    this.addTokens(7, 'Weekly streak bonus');
    this.weeklyRewardsClaimed += 1;
  }
  
  return this.save();
};

// Check if daily reward is available
tokenWalletSchema.methods.canClaimDaily = function() {
  if (!this.lastDailyReward) return true;
  
  const today = new Date().toISOString().split('T')[0];
  const lastRewardDate = this.lastDailyReward.split('T')[0];
  
  return lastRewardDate !== today;
};

// Remove sensitive data from JSON output
tokenWalletSchema.methods.toJSON = function() {
  const walletObject = this.toObject();
  delete walletObject._id;
  delete walletObject.__v;
  return walletObject;
};

const TokenWallet = mongoose.model('TokenWallet', tokenWalletSchema);

export default TokenWallet;

