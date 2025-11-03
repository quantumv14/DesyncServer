import express from 'express';
import ChatMessage from '../models/ChatMessage.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for chat messages
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 messages per minute
  message: { success: false, message: 'Too many messages, please slow down.' }
});

// @route   GET /api/chat/messages
// @desc    Get recent chat messages
// @access  Public
router.get('/messages', optionalAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const messages = await ChatMessage.find({ deleted: false })
      .sort({ createdAt: -1 })
      .limit(limit);
    
    res.json({
      success: true,
      messages: messages.reverse() // Oldest first for display
    });
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching messages'
    });
  }
});

// @route   POST /api/chat/messages
// @desc    Send a chat message
// @access  Private
router.post('/messages', authenticateToken, chatLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    const message = new ChatMessage({
      userUid: req.user.uid,
      username: req.user.username,
      userBadge: req.user.badge,
      content: content.trim().substring(0, 500)
    });
    
    await message.save();
    
    res.status(201).json({
      success: true,
      message: message.toJSON()
    });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending message'
    });
  }
});

// @route   DELETE /api/chat/messages/:messageId
// @desc    Delete a chat message
// @access  Private
router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userUid = req.user.uid;
    
    const message = await ChatMessage.findOne({ id: parseInt(messageId) });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Only sender or moderator can delete
    if (message.userUid !== userUid && !req.user.isModerator()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }
    
    message.deleted = true;
    await message.save();
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete chat message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting message'
    });
  }
});

export default router;

