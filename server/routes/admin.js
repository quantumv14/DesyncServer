import express from 'express';
import User from '../models/User.js';
import InvitationCode from '../models/InvitationCode.js';
import Thread from '../models/Thread.js';
import Post from '../models/Post.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware to check if user is admin or owner
const requireAdmin = (req, res, next) => {
  if (!req.user || (req.user.badge !== 'Owner' && req.user.badge !== 'Admin')) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// @route   GET /api/admin/events
// @desc    Get available admin events
// @access  Admin
router.get('/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Return available events (hardcoded for now, can be moved to database later)
    const events = [
      {
        id: 1,
        name: 'Invite Wave',
        description: 'Give all users an invite that lasts 2 months',
        type: 'invite_wave',
        isActive: true,
        createdAt: new Date().toISOString(),
        executedAt: null
      },
      {
        id: 2,
        name: 'Token Bonus',
        description: 'Give all users bonus Desync$ tokens',
        type: 'reward_drop',
        isActive: true,
        createdAt: new Date().toISOString(),
        executedAt: null
      }
    ];

    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching events'
    });
  }
});

// @route   POST /api/admin/events/invite-wave
// @desc    Execute invite wave event - give all users invites
// @access  Admin
router.post('/events/invite-wave', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get all non-banned users
    const users = await User.find({ banned: false });
    
    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No users found to give invites'
      });
    }

    // Calculate expiry date (2 months from now)
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 2);
    
    // Add invite to each user's inventory
    const updatePromises = users.map(user => {
      // Ensure inventory array exists
      if (!user.inventory) {
        user.inventory = [];
      }
      
      // Add new invite
      user.inventory.push({
        id: Date.now() + Math.random(), // Simple unique ID
        name: 'Forum Invite',
        type: 'invite',
        description: 'Invite a friend to join the forum community',
        expiresAt: expiryDate.toISOString(),
        createdAt: new Date().toISOString()
      });
      
      return user.save();
    });
    
    await Promise.all(updatePromises);
    
    console.log(`✅ Invite wave executed: ${users.length} users received invites`);
    
    res.json({
      success: true,
      message: `Successfully gave invites to ${users.length} users`,
      affectedUsers: users.length,
      expiresAt: expiryDate.toISOString()
    });
  } catch (error) {
    console.error('❌ Error executing invite wave:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while executing invite wave'
    });
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Admin
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const bannedUsers = await User.countDocuments({ banned: true });
    const activeUsers = totalUsers - bannedUsers;
    
    const totalCodes = await InvitationCode.countDocuments();
    const usedCodes = await InvitationCode.countDocuments({ used: true });
    const activeCodes = await InvitationCode.countDocuments({ 
      used: false, 
      expiresAt: { $gt: new Date().toISOString() } 
    });

    // Get user distribution by badge
    const badgeDistribution = await User.aggregate([
      { $group: { _id: '$badge', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get recent registrations (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentRegistrations = await User.countDocuments({ 
      joinDate: { $gte: thirtyDaysAgo } 
    });

    // Get thread and post counts
    const totalThreads = await Thread.countDocuments();
    const totalPosts = await Post.countDocuments();
    
    // Get threads from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const newThreadsThisWeek = await Thread.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          banned: bannedUsers,
          recentRegistrations,
          newThisWeek: recentRegistrations
        },
        content: {
          threads: totalThreads,
          posts: totalPosts,
          newThreadsThisWeek
        },
        invitationCodes: {
          total: totalCodes,
          used: usedCodes,
          active: activeCodes,
          expired: totalCodes - usedCodes - activeCodes
        },
        reports: {
          pending: 0 // TODO: Implement reports system
        },
        badgeDistribution: badgeDistribution.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        bannedByCountry: {} // TODO: Implement country tracking
      }
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching statistics'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users including banned ones (admin view)
// @access  Admin
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const search = req.query.search;
    const badge = req.query.badge;
    const banned = req.query.banned;
    const sortBy = req.query.sortBy || 'joinDate';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (badge) {
      query.badge = badge;
    }
    
    if (banned !== undefined) {
      query.banned = banned === 'true';
    }

    const users = await User.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select('-password');

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      users: users.map(u => u.toJSON()),
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
});

// @route   POST /api/admin/codes/generate
// @desc    Generate new invitation code
// @access  Admin
router.post('/codes/generate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { expiresAt, customCode } = req.body;

    // Generate random code if no custom code provided
    const code = customCode || Math.random().toString(36).substring(2, 10).toUpperCase();

    // Check if code already exists
    const existingCode = await InvitationCode.findOne({ code });
      if (existingCode) {
        return res.status(409).json({
          success: false,
          message: 'Code already exists'
        });
    }

    // Create new invitation code
    const inviteCode = new InvitationCode({
      code,
      createdBy: req.user.uid,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days default
      used: false
    });

    await inviteCode.save();

    res.json({
      success: true,
      message: 'Invitation code generated successfully',
      code: inviteCode
    });
  } catch (error) {
    console.error('Generate invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating invitation code'
    });
  }
});

// @route   GET /api/admin/codes
// @desc    Get all invitation codes
// @access  Admin
router.get('/codes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const codes = await InvitationCode.find()
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      codes
    });
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching invitation codes'
    });
  }
});

// @route   DELETE /api/admin/codes/:code
// @desc    Delete an invitation code
// @access  Admin
router.delete('/codes/:code', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    
    const inviteCode = await InvitationCode.findOneAndDelete({ code });
    
    if (!inviteCode) {
      return res.status(404).json({
        success: false,
        message: 'Invitation code not found'
      });
    }

    res.json({
      success: true,
      message: 'Invitation code deleted successfully'
    });
  } catch (error) {
    console.error('Delete invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting invitation code'
    });
  }
});

// @route   POST /api/admin/users/:uid/ban
// @desc    Ban a user
// @access  Admin
router.post('/users/:uid/ban', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const { reason } = req.body;
    
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Ban reason is required'
      });
    }

    const user = await User.findOne({ uid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Can't ban yourself
    if (user.uid === req.user.uid) {
      return res.status(400).json({
        success: false,
        message: 'You cannot ban yourself'
      });
    }

    // Only owner can ban other owners/admins
    if ((user.badge === 'Owner' || user.badge === 'Admin') && req.user.badge !== 'Owner') {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can ban other admins'
      });
    }

    user.banned = true;
    user.banReason = reason;
    user.bannedAt = new Date().toISOString();
    await user.save();

    res.json({
      success: true,
      message: `User ${user.username} has been banned`,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while banning user'
    });
  }
});

// @route   POST /api/admin/users/:uid/unban
// @desc    Unban a user
// @access  Admin
router.post('/users/:uid/unban', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findOne({ uid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.banned) {
      return res.status(400).json({
        success: false,
        message: 'User is not banned'
      });
    }

    user.banned = false;
    user.banReason = undefined;
    user.bannedAt = undefined;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.username} has been unbanned`,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while unbanning user'
    });
  }
});

// @route   GET /api/admin/reports
// @desc    Get all reports (placeholder - to be implemented)
// @access  Admin
router.get('/reports', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // TODO: Implement proper reports system with Report model
    // For now, return empty array to prevent frontend errors
    res.json({
      success: true,
      reports: [],
      message: 'Reports system coming soon'
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reports'
    });
  }
});

// @route   PUT /api/admin/users/:uid/rank
// @desc    Change user rank/badge
// @access  Admin
router.put('/users/:uid/rank', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const { badge } = req.body;
    
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const validBadges = ['Owner', 'Admin', 'Moderator', 'Support', 'Premium', 'Known', 'Member'];
    if (!badge || !validBadges.includes(badge)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid badge. Valid badges: ' + validBadges.join(', ')
      });
    }

    const user = await User.findOne({ uid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Can't change your own rank
    if (user.uid === req.user.uid) {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own rank'
      });
    }

    // Only owner can create other owners or change owner rank
    if (badge === 'Owner' && req.user.badge !== 'Owner') {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can grant owner privileges'
      });
    }

    if (user.badge === 'Owner' && req.user.badge !== 'Owner') {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can change owner rank'
      });
    }

    const oldBadge = user.badge;
    user.badge = badge;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.username} rank changed from ${oldBadge} to ${badge}`,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Change user rank error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing user rank'
    });
  }
});

export default router;
