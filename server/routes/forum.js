import express from 'express';
import Category from '../models/Category.js';
import Thread from '../models/Thread.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { authenticateToken, optionalAuth, requireModerator } from '../middleware/auth.js';
import { createMentionsFromContent } from '../utils/mentions.js';

const router = express.Router();

// @route   GET /api/forum/categories
// @desc    Get all forum categories
// @access  Public
router.get('/categories', optionalAuth, async (req, res) => {
  try {
    const categories = await Category.find({ active: true })
      .sort({ order: 1, createdAt: 1 });

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching categories'
    });
  }
});

// @route   GET /api/forum/threads
// @desc    Get threads (optionally filtered by category)
// @access  Public
router.get('/threads', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : null;

    let query = { deleted: false };
    if (categoryId) {
      query.categoryId = categoryId;
    }

    const threads = await Thread.find(query)
      .sort({ pinned: -1, lastActivity: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Thread.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      threads,
      pagination: {
        currentPage: page,
        totalPages,
        totalThreads: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching threads'
    });
  }
});

// @route   GET /api/forum/threads/:id
// @desc    Get single thread with posts
// @access  Public
router.get('/threads/:id', optionalAuth, async (req, res) => {
  try {
    const threadId = parseInt(req.params.id);
    
    if (isNaN(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID'
      });
    }

    const thread = await Thread.findOne({ id: threadId, deleted: false });
    
    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found'
      });
    }

    // Increment view count
    await thread.incrementViews();

    res.json({
      success: true,
      thread
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching thread'
    });
  }
});

// @route   POST /api/forum/threads
// @desc    Create new thread
// @access  Private
router.post('/threads', authenticateToken, async (req, res) => {
  try {
    const { categoryId, title, content } = req.body;

    if (!categoryId || !title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Category ID, title, and content are required'
      });
    }

    // Validate category exists
    const category = await Category.findOne({ id: categoryId, active: true });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const thread = new Thread({
      categoryId,
      title: title.trim(),
      content: content.trim(),
      authorUid: req.user.uid,
      authorUsername: req.user.username,
      authorBadge: req.user.badge
    });

    await thread.save();

    // Create mentions
    try {
      await createMentionsFromContent(content, 'thread', thread.id, req.user.uid, thread.id);
    } catch (mentionError) {
      console.error('Mention creation error:', mentionError);
      // Don't fail the thread creation if mentions fail
    }

    // Update category stats
    await category.updateThreadCount();
    await category.updateLastActivity();

    // Update user message count
    await req.user.incrementMessages();

    res.status(201).json({
      success: true,
      message: 'Thread created successfully',
      thread
    });
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating thread'
    });
  }
});

// @route   GET /api/forum/threads/:id/posts
// @desc    Get posts for a thread
// @access  Public
router.get('/threads/:id/posts', optionalAuth, async (req, res) => {
  try {
    const threadId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    if (isNaN(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID'
      });
    }

    // Verify thread exists
    const thread = await Thread.findOne({ id: threadId, deleted: false });
    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found'
      });
    }

    const posts = await Post.find({ threadId, deleted: false })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments({ threadId, deleted: false });
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      posts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching posts'
    });
  }
});

// @route   POST /api/forum/posts
// @desc    Create new post
// @access  Private
router.post('/posts', authenticateToken, async (req, res) => {
  try {
    const { threadId, content } = req.body;

    if (!threadId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Thread ID and content are required'
      });
    }

    // Validate thread exists and is not locked
    const thread = await Thread.findOne({ id: threadId, deleted: false });
    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found'
      });
    }

    if (thread.locked && !req.user.isModerator()) {
      return res.status(403).json({
        success: false,
        message: 'Thread is locked'
      });
    }

    const post = new Post({
      threadId,
      content: content.trim(),
      authorUid: req.user.uid,
      authorUsername: req.user.username,
      authorBadge: req.user.badge
    });

    await post.save();

    // Create mentions
    try {
      await createMentionsFromContent(content, 'post', post.id, req.user.uid, thread.id);
    } catch (mentionError) {
      console.error('Mention creation error:', mentionError);
      // Don't fail the post creation if mentions fail
    }

    // Update thread stats
    await thread.updateReplyCount();
    await thread.updateLastActivity(req.user.uid);

    // Update category stats
    const category = await Category.findOne({ id: thread.categoryId });
    if (category) {
      await category.updatePostCount();
      await category.updateLastActivity();
    }

    // Update user message count
    await req.user.incrementMessages();

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating post'
    });
  }
});

// @route   POST /api/forum/posts/:postId/reactions
// @desc    Add reaction to a post
// @access  Private
router.post('/posts/:postId/reactions', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.uid;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required'
      });
    }

    const post = await Post.findOne({ id: parseInt(postId) });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Initialize reactions if not exists
    if (!post.reactions) {
      post.reactions = new Map();
    }

    // Initialize emoji count if not exists
    if (!post.reactions.has(emoji)) {
      post.reactions.set(emoji, []);
    }

    // Get current users for this emoji
    const currentUsers = post.reactions.get(emoji) || [];
    const existingReactionIndex = currentUsers.indexOf(userId);
    
    if (existingReactionIndex > -1) {
      // Remove reaction if already exists
      currentUsers.splice(existingReactionIndex, 1);
      if (currentUsers.length === 0) {
        post.reactions.delete(emoji);
      } else {
        post.reactions.set(emoji, currentUsers);
      }
    } else {
      // Add reaction
      currentUsers.push(userId);
      post.reactions.set(emoji, currentUsers);
    }

    // Update reaction count
    let totalCount = 0;
    for (const users of post.reactions.values()) {
      totalCount += users.length;
    }
    post.reactionCount = totalCount;

    await post.save();

    res.json({
      success: true,
      message: 'Reaction updated',
      reactions: post.reactions,
      reactionCount: post.reactionCount
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating reaction'
    });
  }
});

// @route   GET /api/forum/posts/:postId/reactions
// @desc    Get reactions for a post
// @access  Public
router.get('/posts/:postId/reactions', optionalAuth, async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOne({ id: parseInt(postId) });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    res.json({
      success: true,
      reactions: post.reactions || {},
      reactionCount: post.reactionCount || 0
    });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reactions'
    });
  }
});

export default router;