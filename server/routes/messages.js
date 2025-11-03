import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { authenticateToken } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for message creation
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 messages per minute
  message: { success: false, message: 'Too many messages sent, please slow down.' }
});

// @route   GET /api/messages/conversations
// @desc    Get user's conversations
// @access  Private
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userUid = req.user.uid;
    
    const conversations = await Conversation.find({
      participants: userUid,
      archived: false
    }).sort({ lastMessageAt: -1 });
    
    // Get participant details for each conversation
    const conversationsWithUsers = await Promise.all(
      conversations.map(async (conv) => {
        const otherParticipantUid = conv.participants.find(p => p !== userUid);
        const otherUser = await User.findOne({ uid: otherParticipantUid })
          .select('uid username badge');
        
        return {
          ...conv.toJSON(),
          otherUser,
          unreadCount: conv.unreadCount.get(userUid.toString()) || 0
        };
      })
    );
    
    res.json({
      success: true,
      conversations: conversationsWithUsers
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching conversations'
    });
  }
});

// @route   GET /api/messages/conversation/:conversationId
// @desc    Get messages in a conversation
// @access  Private
router.get('/conversation/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userUid = req.user.uid;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Verify user is participant
    const conversation = await Conversation.findOne({ 
      id: parseInt(conversationId),
      participants: userUid
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    // Get messages
    const messages = await Message.find({
      conversationId: parseInt(conversationId),
      deleted: false
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
    
    const total = await Message.countDocuments({
      conversationId: parseInt(conversationId),
      deleted: false
    });
    
    // Mark messages as read
    await conversation.markAsRead(userUid);
    
    res.json({
      success: true,
      messages: messages.reverse(), // Oldest first for display
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching messages'
    });
  }
});

// @route   POST /api/messages/send
// @desc    Send a message
// @access  Private
router.post('/send', authenticateToken, messageLimiter, async (req, res) => {
  try {
    const { recipientUid, content } = req.body;
    const senderUid = req.user.uid;
    
    if (!recipientUid || !content) {
      return res.status(400).json({
        success: false,
        message: 'Recipient and content are required'
      });
    }
    
    if (senderUid === recipientUid) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send message to yourself'
      });
    }
    
    // Check if recipient exists
    const recipient = await User.findOne({ uid: recipientUid });
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }
    
    // Find or create conversation
    let conversation = await Conversation.findBetweenUsers(senderUid, recipientUid);
    
    if (!conversation) {
      conversation = new Conversation({
        participants: [senderUid, recipientUid]
      });
      await conversation.save();
    }
    
    // Create message
    const message = new Message({
      conversationId: conversation.id,
      senderUid,
      content: content.trim().substring(0, 5000)
    });
    
    await message.save();
    
    // Update conversation
    await conversation.updateLastMessage(content, senderUid);
    
    // Create notification for recipient
    await Notification.createNotification(
      recipientUid,
      'pm',
      'New Message',
      `${req.user.username} sent you a message`,
      { conversationId: conversation.id },
      message.id,
      senderUid
    );
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      messageData: message,
      conversationId: conversation.id
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending message'
    });
  }
});

// @route   GET /api/messages/unread-count
// @desc    Get unread message count
// @access  Private
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const userUid = req.user.uid;
    
    const conversations = await Conversation.find({
      participants: userUid
    });
    
    let totalUnread = 0;
    conversations.forEach(conv => {
      totalUnread += conv.unreadCount.get(userUid.toString()) || 0;
    });
    
    res.json({
      success: true,
      unreadCount: totalUnread
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching unread count'
    });
  }
});

// @route   PUT /api/messages/conversation/:conversationId/read
// @desc    Mark conversation as read
// @access  Private
router.put('/conversation/:conversationId/read', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userUid = req.user.uid;
    
    const conversation = await Conversation.findOne({
      id: parseInt(conversationId),
      participants: userUid
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    await conversation.markAsRead(userUid);
    
    res.json({
      success: true,
      message: 'Conversation marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking conversation as read'
    });
  }
});

// @route   DELETE /api/messages/:messageId
// @desc    Delete a message
// @access  Private
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userUid = req.user.uid;
    
    const message = await Message.findOne({ id: parseInt(messageId) });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Only sender can delete
    if (message.senderUid !== userUid) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }
    
    message.deleted = true;
    message.deletedAt = new Date().toISOString();
    await message.save();
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting message'
    });
  }
});

export default router;

