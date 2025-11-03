import express from 'express';
import Software from '../models/Software.js';
import { authenticateToken, optionalAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/software
// @desc    Get all software products
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const category = req.query.category;
    const status = req.query.status || 'Active';
    const search = req.query.search;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build query
    let query = { status };
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const software = await Software.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    const total = await Software.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      software,
      pagination: {
        currentPage: page,
        totalPages,
        totalSoftware: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get software error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching software'
    });
  }
});

// @route   GET /api/software/:id
// @desc    Get single software product
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid software ID'
      });
    }

    const software = await Software.findOne({ id });
    
    if (!software) {
      return res.status(404).json({
        success: false,
        message: 'Software not found'
      });
    }

    // Only show active software to non-admin users
    if (software.status !== 'Active' && (!req.user || !req.user.isAdmin())) {
      return res.status(404).json({
        success: false,
        message: 'Software not found'
      });
    }

    res.json({
      success: true,
      software
    });
  } catch (error) {
    console.error('Get software error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching software'
    });
  }
});

// @route   POST /api/software
// @desc    Create new software product
// @access  Admin
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      currency,
      category,
      version,
      downloadUrl,
      imageUrl,
      features,
      requirements,
      compatibility,
      status
    } = req.body;

    if (!name || !description || price === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, price, and category are required'
      });
    }

    const software = new Software({
      name: name.trim(),
      description: description.trim(),
      price,
      currency: currency || 'USD',
      category,
      version: version || '1.0.0',
      downloadUrl,
      imageUrl,
      features: features || [],
      requirements: requirements || [],
      compatibility: compatibility || [],
      status: status || 'Active',
      createdBy: req.user.uid
    });

    await software.save();

    res.status(201).json({
      success: true,
      message: 'Software created successfully',
      software
    });
  } catch (error) {
    console.error('Create software error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating software'
    });
  }
});

// @route   PUT /api/software/:id
// @desc    Update software product
// @access  Admin
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid software ID'
      });
    }

    const software = await Software.findOne({ id });
    
    if (!software) {
      return res.status(404).json({
        success: false,
        message: 'Software not found'
      });
    }

    const {
      name,
      description,
      price,
      currency,
      category,
      version,
      downloadUrl,
      imageUrl,
      features,
      requirements,
      compatibility,
      status
    } = req.body;

    // Update fields if provided
    if (name !== undefined) software.name = name.trim();
    if (description !== undefined) software.description = description.trim();
    if (price !== undefined) software.price = price;
    if (currency !== undefined) software.currency = currency;
    if (category !== undefined) software.category = category;
    if (version !== undefined) software.version = version;
    if (downloadUrl !== undefined) software.downloadUrl = downloadUrl;
    if (imageUrl !== undefined) software.imageUrl = imageUrl;
    if (features !== undefined) software.features = features;
    if (requirements !== undefined) software.requirements = requirements;
    if (compatibility !== undefined) software.compatibility = compatibility;
    if (status !== undefined) software.status = status;
    
    software.updatedAt = new Date().toISOString();

    await software.save();

    res.json({
      success: true,
      message: 'Software updated successfully',
      software
    });
  } catch (error) {
    console.error('Update software error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating software'
    });
  }
});

// @route   DELETE /api/software/:id
// @desc    Delete software product
// @access  Admin
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid software ID'
      });
    }

    const software = await Software.findOne({ id });
    
    if (!software) {
      return res.status(404).json({
        success: false,
        message: 'Software not found'
      });
    }

    // Check if software has purchases
    const Purchase = (await import('../models/Purchase.js')).default;
    const purchaseCount = await Purchase.countDocuments({ softwareId: id });
    
    if (purchaseCount > 0) {
      // Don't delete if there are purchases, just mark as discontinued
      software.status = 'Discontinued';
      software.updatedAt = new Date().toISOString();
      await software.save();
      
      return res.json({
        success: true,
        message: 'Software marked as discontinued (has existing purchases)'
      });
    }

    await Software.deleteOne({ id });

    res.json({
      success: true,
      message: 'Software deleted successfully'
    });
  } catch (error) {
    console.error('Delete software error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting software'
    });
  }
});

// @route   GET /api/software/categories/list
// @desc    Get list of software categories
// @access  Public
router.get('/categories/list', (req, res) => {
  const categories = ['Cheat', 'Tool', 'Script', 'Mod', 'Other'];
  
  res.json({
    success: true,
    categories
  });
});

export default router;