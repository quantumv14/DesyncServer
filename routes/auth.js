import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import InvitationCode from '../models/InvitationCode.js';
import { generateToken, getClientIP } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is banned
    if (user.banned) {
      return res.status(403).json({
        success: false,
        message: 'Account is banned',
        user: {
          banned: true,
          banReason: user.banReason,
          bannedAt: user.bannedAt
        }
      });
    }

    // Update last seen and IP
    await user.updateLastSeen(getClientIP(req));

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, invitationCode } = req.body;

    // Validate input
    if (!email || !username || !password || !invitationCode) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate email domain
    const allowedDomains = ['gmail.com', 'hotmail.com', 'outlook.com'];
    const emailDomain = email.toLowerCase().split('@')[1];
    if (!allowedDomains.includes(emailDomain)) {
      return res.status(400).json({
        success: false,
        message: 'Email must be from Gmail, Hotmail, or Outlook'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Validate username length
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Username must be between 3 and 20 characters'
      });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        message: 'Username already taken'
      });
    }

    // Validate invitation code
    const inviteCode = await InvitationCode.findOne({ code: invitationCode.toUpperCase() });
    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invitation code'
      });
    }

    if (!inviteCode.isValid()) {
      let message = 'Invalid invitation code';
      if (inviteCode.isExpired()) {
        message = 'Invitation code has expired';
      } else if (inviteCode.used || inviteCode.currentUses >= inviteCode.maxUses) {
        message = 'Invitation code has already been used';
      }
      
      return res.status(400).json({
        success: false,
        message
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const newUser = new User({
      email: email.toLowerCase(),
      username: username.trim(),
      password: hashedPassword,
      badge: 'Member',
      joinDate: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      ipAddress: getClientIP(req),
      messages: 0,
      reactionScore: 0,
      points: 0,
      banned: false
    });

    await newUser.save();

    // Mark invitation code as used
    await inviteCode.markAsUsed(newUser.uid);

    // Generate JWT token
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: newUser.toJSON(),
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    
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
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/verify-token
// @desc    Verify JWT token
// @access  Private
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ uid: decoded.uid });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    if (user.banned) {
      return res.status(403).json({
        success: false,
        message: 'Account is banned',
        user: {
          banned: true,
          banReason: user.banReason,
          bannedAt: user.bannedAt
        }
      });
    }

    // Update last seen
    await user.updateLastSeen(getClientIP(req));

    res.json({
      success: true,
      message: 'Token is valid',
      user: user.toJSON()
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during token verification'
    });
  }
});

export default router;