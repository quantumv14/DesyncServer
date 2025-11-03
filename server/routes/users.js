import express from 'express';
import User from '../models/User.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users
// @access  Public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const users = await User.find({ banned: false })
      .select('-password')
      .sort({ joinDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments({ banned: false });
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
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
});

// @route   GET /api/users/:uid
// @desc    Get user by UID
// @access  Public
router.get('/:uid', optionalAuth, async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findOne({ uid }).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't show banned users to non-admin users
    if (user.banned && (!req.user || !req.user.isAdmin())) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
});

// @route   GET /api/users/:uid/profile
// @desc    Get detailed user profile
// @access  Public
router.get('/:uid/profile', optionalAuth, async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findOne({ uid }).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't show banned users to non-admin users
    if (user.banned && (!req.user || !req.user.isAdmin())) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user profile'
    });
  }
});

// @route   GET /api/users/:uid/inventory
// @desc    Get user inventory
// @access  Private (own inventory) or Admin
router.get('/:uid/inventory', authenticateToken, async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Only allow users to see their own inventory, or admins to see any
    if (req.user.uid !== uid && !req.user.isAdmin()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findOne({ uid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      inventory: user.inventory || []
    });
  } catch (error) {
    console.error('Get user inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching inventory'
    });
  }
});

// @route   PATCH /api/users/:uid
// @desc    Update user profile
// @access  Private (own profile) or Admin
router.patch('/:uid', authenticateToken, async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Only allow users to edit their own profile, or admins to edit any
    if (req.user.uid !== uid && !req.user.isAdmin()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findOne({ uid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Only allow certain fields to be updated
    const allowedUpdates = ['username', 'email', 'aboutMe', 'avatar'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Update user
    Object.assign(user, updates);
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update user error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation error'
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
});

export default router;
