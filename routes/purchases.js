import express from 'express';
import Purchase from '../models/Purchase.js';
import Software from '../models/Software.js';
import User from '../models/User.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/purchases
// @desc    Create new purchase
// @access  Private
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { softwareId, paymentMethod } = req.body;

    if (!softwareId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Software ID and payment method are required'
      });
    }

    // Validate software exists and is purchasable
    const software = await Software.findOne({ id: softwareId });
    if (!software) {
      return res.status(404).json({
        success: false,
        message: 'Software not found'
      });
    }

    if (!software.isPurchasable()) {
      return res.status(400).json({
        success: false,
        message: 'Software is not available for purchase'
      });
    }

    // Check if user already owns this software
    const existingPurchase = await Purchase.findOne({
      userId: req.user.uid,
      softwareId,
      status: 'Completed'
    });

    if (existingPurchase) {
      return res.status(409).json({
        success: false,
        message: 'You already own this software'
      });
    }

    const purchase = new Purchase({
      userId: req.user.uid,
      softwareId,
      paymentMethod,
      amount: software.price,
      currency: software.currency
    });

    await purchase.save();

    // For demo purposes, auto-complete the purchase
    // In production, this would integrate with payment processors
    await purchase.completePurchase(`DEMO_${Date.now()}`);
    await software.incrementSales();

    res.status(201).json({
      success: true,
      message: 'Purchase completed successfully',
      purchase
    });
  } catch (error) {
    console.error('Create purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while processing purchase'
    });
  }
});

// @route   GET /api/purchases/user/:userId
// @desc    Get user's purchases
// @access  Private (own purchases) or Admin
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Users can only view their own purchases unless admin
    if (req.user.uid !== userId && !req.user.isAdmin()) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own purchases'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let query = { userId };
    if (status) {
      query.status = status;
    }

    const purchases = await Purchase.find(query)
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Purchase.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get software details for each purchase
    const purchasesWithSoftware = await Promise.all(
      purchases.map(async (purchase) => {
        const software = await Software.findOne({ id: purchase.softwareId });
        return {
          ...purchase.toJSON(),
          software: software ? {
            id: software.id,
            name: software.name,
            version: software.version,
            category: software.category
          } : null
        };
      })
    );

    res.json({
      success: true,
      purchases: purchasesWithSoftware,
      pagination: {
        currentPage: page,
        totalPages,
        totalPurchases: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get user purchases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching purchases'
    });
  }
});

// @route   GET /api/purchases/:id
// @desc    Get single purchase
// @access  Private (own purchase) or Admin
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid purchase ID'
      });
    }

    const purchase = await Purchase.findOne({ id });
    
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    // Users can only view their own purchases unless admin
    if (req.user.uid !== purchase.userId && !req.user.isAdmin()) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own purchases'
      });
    }

    // Get software details
    const software = await Software.findOne({ id: purchase.softwareId });
    const purchaseWithSoftware = {
      ...purchase.toJSON(),
      software: software ? {
        id: software.id,
        name: software.name,
        description: software.description,
        version: software.version,
        category: software.category,
        downloadUrl: software.downloadUrl
      } : null
    };

    res.json({
      success: true,
      purchase: purchaseWithSoftware
    });
  } catch (error) {
    console.error('Get purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching purchase'
    });
  }
});

// @route   POST /api/purchases/:id/download
// @desc    Record download for purchase
// @access  Private (own purchase)
router.post('/:id/download', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid purchase ID'
      });
    }

    const purchase = await Purchase.findOne({ id });
    
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    // Users can only download their own purchases
    if (req.user.uid !== purchase.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only download your own purchases'
      });
    }

    if (!purchase.canDownload()) {
      let message = 'Download not available';
      if (purchase.status !== 'Completed') {
        message = 'Purchase not completed';
      } else if (purchase.downloadCount >= purchase.maxDownloads) {
        message = 'Download limit exceeded';
      } else if (purchase.expiresAt && new Date() > new Date(purchase.expiresAt)) {
        message = 'Purchase has expired';
      }
      
      return res.status(400).json({
        success: false,
        message
      });
    }

    await purchase.recordDownload();

    // Get software download URL
    const software = await Software.findOne({ id: purchase.softwareId });
    
    res.json({
      success: true,
      message: 'Download recorded successfully',
      downloadUrl: software?.downloadUrl || null,
      remainingDownloads: purchase.maxDownloads - purchase.downloadCount
    });
  } catch (error) {
    console.error('Record download error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while recording download'
    });
  }
});

// @route   GET /api/purchases
// @desc    Get all purchases (admin only)
// @access  Admin
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const softwareId = req.query.softwareId ? parseInt(req.query.softwareId) : null;
    const sortBy = req.query.sortBy || 'purchaseDate';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    let query = {};
    if (status) query.status = status;
    if (userId) query.userId = userId;
    if (softwareId) query.softwareId = softwareId;

    const purchases = await Purchase.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    const total = await Purchase.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get user and software details
    const purchasesWithDetails = await Promise.all(
      purchases.map(async (purchase) => {
        const user = await User.findOne({ uid: purchase.userId }).select('username email');
        const software = await Software.findOne({ id: purchase.softwareId }).select('name version category');
        
        return {
          ...purchase.toJSON(),
          user: user ? { username: user.username, email: user.email } : null,
          software: software ? { name: software.name, version: software.version, category: software.category } : null
        };
      })
    );

    res.json({
      success: true,
      purchases: purchasesWithDetails,
      pagination: {
        currentPage: page,
        totalPages,
        totalPurchases: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get all purchases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching purchases'
    });
  }
});

export default router;