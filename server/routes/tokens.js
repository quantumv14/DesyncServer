import express from 'express';
import TokenWallet from '../models/TokenWallet.js';
import UserRole from '../models/UserRole.js';
import Role from '../models/Role.js';
import Product from '../models/Product.js';
import Notification from '../models/Notification.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/tokens/wallet
// @desc    Get user's token wallet
// @access  Private
router.get('/wallet', authenticateToken, async (req, res) => {
  try {
    const userUid = req.user.uid;
    
    let wallet = await TokenWallet.findOne({ userUid });
    
    if (!wallet) {
      // Create wallet if doesn't exist
      wallet = new TokenWallet({ userUid });
      await wallet.save();
    }
    
    res.json({
      success: true,
      wallet: wallet.toJSON(),
      canClaimDaily: wallet.canClaimDaily()
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching wallet'
    });
  }
});

// @route   POST /api/tokens/claim-daily
// @desc    Claim daily reward
// @access  Private
router.post('/claim-daily', authenticateToken, async (req, res) => {
  try {
    const userUid = req.user.uid;
    
    let wallet = await TokenWallet.findOne({ userUid });
    
    if (!wallet) {
      wallet = new TokenWallet({ userUid });
    }
    
    // Try to claim
    try {
      await wallet.claimDailyReward();
      
      // Create notification
      await Notification.createNotification(
        userUid,
        'token_reward',
        'Daily Reward Claimed!',
        `You earned 1 Desync$ for logging in today! Current streak: ${wallet.currentStreak} days`,
        { streak: wallet.currentStreak },
        null,
        null
      );
      
      res.json({
        success: true,
        message: 'Daily reward claimed successfully',
        wallet: wallet.toJSON(),
        streak: wallet.currentStreak
      });
    } catch (claimError) {
      return res.status(400).json({
        success: false,
        message: claimError.message
      });
    }
  } catch (error) {
    console.error('Claim daily error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while claiming daily reward'
    });
  }
});

// @route   GET /api/tokens/redemptions
// @desc    Get available token redemptions
// @access  Private
router.get('/redemptions', authenticateToken, async (req, res) => {
  try {
    const redemptions = [
      {
        id: 'profile-effect',
        name: 'Profile Name Effect',
        description: 'Add a special effect to your profile name',
        cost: 50,
        type: 'cosmetic'
      },
      {
        id: 'desync-movement-1week',
        name: '1 Week Desync Movement',
        description: '1 week access to Desync Movement',
        cost: 100,
        type: 'access',
        duration: 7
      },
      {
        id: 'desync-hvh-1week',
        name: '1 Week Desync HvH',
        description: '1 week access to Desync HvH',
        cost: 150,
        type: 'access',
        duration: 7
      }
    ];
    
    res.json({
      success: true,
      redemptions
    });
  } catch (error) {
    console.error('Get redemptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching redemptions'
    });
  }
});

// @route   POST /api/tokens/redeem
// @desc    Redeem tokens for a reward
// @access  Private
router.post('/redeem', authenticateToken, async (req, res) => {
  try {
    const { redemptionId } = req.body;
    const userUid = req.user.uid;
    
    if (!redemptionId) {
      return res.status(400).json({
        success: false,
        message: 'Redemption ID is required'
      });
    }
    
    // Get wallet
    let wallet = await TokenWallet.findOne({ userUid });
    
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found'
      });
    }
    
    // Define redemption options
    const redemptions = {
      'profile-effect': { cost: 50, name: 'Profile Name Effect', type: 'cosmetic' },
      'desync-movement-1week': { cost: 100, name: '1 Week Desync Movement', type: 'access', roleSlug: 'desync-movement', duration: 7 },
      'desync-hvh-1week': { cost: 150, name: '1 Week Desync HvH', type: 'access', roleSlug: 'desync-hvh', duration: 7 }
    };
    
    const redemption = redemptions[redemptionId];
    
    if (!redemption) {
      return res.status(400).json({
        success: false,
        message: 'Invalid redemption ID'
      });
    }
    
    // Check balance
    if (wallet.balance < redemption.cost) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient tokens'
      });
    }
    
    // Spend tokens
    await wallet.spendTokens(redemption.cost, `Redeemed: ${redemption.name}`);
    
    // Grant reward
    if (redemption.type === 'access' && redemption.roleSlug) {
      // Find or create role
      let role = await Role.findOne({ slug: redemption.roleSlug });
      
      if (!role) {
        // Create role if it doesn't exist
        role = new Role({
          slug: redemption.roleSlug,
          name: redemption.name,
          description: `Access to ${redemption.name}`,
          permissions: ['access_software'],
          color: '#6366f1'
        });
        await role.save();
      }
      
      // Calculate expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + redemption.duration);
      
      // Assign role
      const userRole = new UserRole({
        userUid,
        roleId: role.id,
        assignedBy: userUid,
        expiresAt: expiresAt.toISOString()
      });
      
      await userRole.save();
      
      // Create notification
      await Notification.createNotification(
        userUid,
        'token_reward',
        'Redemption Successful!',
        `You've redeemed ${redemption.name} for ${redemption.cost} Desync$`,
        { redemptionId, expiresAt: expiresAt.toISOString() },
        null,
        null
      );
    }
    
    res.json({
      success: true,
      message: 'Redemption successful',
      wallet: wallet.toJSON()
    });
  } catch (error) {
    console.error('Redeem error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while processing redemption'
    });
  }
});

// @route   GET /api/tokens/leaderboard
// @desc    Get token leaderboard
// @access  Public
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const topWallets = await TokenWallet.find()
      .sort({ totalEarned: -1 })
      .limit(limit);
    
    // Get user details
    const User = (await import('../models/User.js')).default;
    const leaderboard = await Promise.all(
      topWallets.map(async (wallet) => {
        const user = await User.findOne({ uid: wallet.userUid })
          .select('uid username badge');
        
        return {
          user,
          totalEarned: wallet.totalEarned,
          currentStreak: wallet.currentStreak,
          longestStreak: wallet.longestStreak
        };
      })
    );
    
    res.json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leaderboard'
    });
  }
});

// @route   GET /api/tokens/transactions
// @desc    Get user's token transactions
// @access  Private
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userUid = req.user.uid;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const wallet = await TokenWallet.findOne({ userUid });
    
    if (!wallet) {
      return res.json({
        success: true,
        transactions: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          total: 0
        }
      });
    }
    
    const total = wallet.transactions.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    
    const transactions = wallet.transactions
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(skip, skip + limit);
    
    res.json({
      success: true,
      transactions,
      pagination: {
        currentPage: page,
        totalPages,
        total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching transactions'
    });
  }
});

export default router;

