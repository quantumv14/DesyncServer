import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import forumRoutes from './routes/forum.js';
import adminRoutes from './routes/admin.js';
import softwareRoutes from './routes/software.js';
import purchaseRoutes from './routes/purchases.js';
import serverStatusRoutes from './routes/server-status.js';
import messagesRoutes from './routes/messages.js';
import notificationsRoutes from './routes/notifications.js';
import tokensRoutes from './routes/tokens.js';
import stripeRoutes from './routes/stripe.js';
import chatRoutes from './routes/chat.js';

// Import models
import User from './models/User.js';
import InvitationCode from './models/InvitationCode.js';
import Category from './models/Category.js';

// Initialize environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs (increased for development)
  message: { success: false, message: 'Too many requests from this IP, please try again later.' }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create owner account and initial invitation codes
    await initializeDatabase();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize database with owner account and invitation codes
const initializeDatabase = async () => {
  try {
    // Create owner account if it doesn't exist
    const ownerExists = await User.findOne({ badge: 'Owner' });
    
    if (!ownerExists) {
      const hashedPassword = await bcrypt.hash(process.env.OWNER_PASSWORD, 12);
      
      const owner = new User({
        email: process.env.OWNER_EMAIL,
        username: process.env.OWNER_USERNAME,
        password: hashedPassword,
        badge: 'Owner',
        joinDate: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        ipAddress: '127.0.0.1',
        messages: 0,
        reactionScore: 0,
        points: 0,
        banned: false
      });
      
      await owner.save();
      console.log('✅ Owner account created successfully!');
      console.log(`📧 Owner Email: ${owner.email}`);
      console.log(`👤 Owner Username: ${owner.username}`);
      
      // Create initial invitation codes
      const initialCodes = [
        'DESYNCBETA',
      ];
      
      for (const codeValue of initialCodes) {
        const existingCode = await InvitationCode.findOne({ code: codeValue });
        if (!existingCode) {
          const inviteCode = new InvitationCode({
            code: codeValue,
            createdBy: owner.uid,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
            used: false
          });
          await inviteCode.save();
          console.log(`🎫 Created invitation code: ${codeValue}`);
        }
      }
      
      // Create default forum categories
      await createDefaultCategories(owner.uid);
    } else {
      console.log('✅ Owner account already exists.');
      
      // Still create categories if they don't exist
      const existingCategories = await Category.countDocuments();
      if (existingCategories === 0) {
        await createDefaultCategories(ownerExists.uid);
      }
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};

// Create default forum categories
const createDefaultCategories = async (ownerUid) => {
  try {
        const defaultCategories = [
          {
            name: 'General Discussion',
            description: 'General chat and discussions about anything',
            icon: 'chat',
            color: '#6366f1',
            order: 1
          },
          {
            name: 'Support',
            description: 'Get help with technical issues and questions',
            icon: 'tool',
            color: '#10b981',
            order: 2
          },
          {
            name: 'Announcements',
            description: 'Official announcements and updates',
            icon: 'megaphone',
            color: '#f59e0b',
            order: 3
          },
          {
            name: 'Feature Requests',
            description: 'Suggest new features and improvements',
            icon: 'lightbulb',
            color: '#8b5cf6',
            order: 4
          },
          {
            name: 'Off Topic',
            description: 'Discussions about topics not related to the main subject',
            icon: 'theater',
            color: '#ef4444',
            order: 5
          }
        ];

    for (const categoryData of defaultCategories) {
      const existingCategory = await Category.findOne({ name: categoryData.name });
      if (!existingCategory) {
        const category = new Category({
          ...categoryData,
          createdBy: ownerUid
        });
        await category.save();
        console.log(`📁 Created category: ${categoryData.name}`);
      }
    }
  } catch (error) {
    console.error('❌ Error creating default categories:', error);
  }
};

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/software', softwareRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/server-status', serverStatusRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/tokens', tokensRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/chat', chatRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'Desync Backend API Server',
    version: '1.0.0',
      endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      forum: '/api/forum',
      admin: '/api/admin',
      software: '/api/software',
      purchases: '/api/purchases',
      serverStatus: '/api/server-status',
      messages: '/api/messages',
      notifications: '/api/notifications',
      tokens: '/api/tokens',
      stripe: '/api/stripe',
      chat: '/api/chat'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.originalUrl} not found` 
  });
});

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  });
});