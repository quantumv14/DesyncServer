import express from 'express';
import Stripe from 'stripe';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import UserRole from '../models/UserRole.js';
import Role from '../models/Role.js';
import Notification from '../models/Notification.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize Stripe only if key is provided
let stripe = null;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_YOUR_STRIPE_KEY_HERE') {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('✅ Stripe initialized');
} else {
  console.warn('⚠️ Stripe not initialized - STRIPE_SECRET_KEY not configured');
}

// @route   POST /api/stripe/create-checkout-session
// @desc    Create Stripe checkout session
// @access  Private
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: 'Payment system not configured'
      });
    }
    
    const { productSlug, duration } = req.body;
    const userUid = req.user.uid;
    
    if (!productSlug || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Product slug and duration are required'
      });
    }
    
    // Get product
    const product = await Product.findOne({ slug: productSlug, active: true });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Get price for duration
    const durationObj = product.durations.find(d => d.duration === duration);
    
    if (!durationObj) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration'
      });
    }
    
    // Create purchase record (pending)
    const purchase = new Purchase({
      userId: userUid,
      softwareId: product.id,
      productSlug: productSlug,
      duration: duration,
      durationDays: durationObj.days,
      paymentMethod: 'Card',
      amount: durationObj.price,
      currency: product.currency || 'USD',
      status: 'Pending'
    });
    
    await purchase.save();
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (product.currency || 'USD').toLowerCase(),
            product_data: {
              name: `${product.title} - ${duration}`,
              description: product.description || ''
            },
            unit_amount: Math.round(durationObj.price * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/settings?purchase=success`,
      cancel_url: `${process.env.FRONTEND_URL}/settings?purchase=cancelled`,
      client_reference_id: purchase.id.toString(),
      metadata: {
        purchaseId: purchase.id.toString(),
        userId: userUid.toString(),
        productSlug: productSlug,
        duration: duration
      }
    });
    
    // Update purchase with session ID
    purchase.stripeSessionId = session.id;
    await purchase.save();
    
    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating checkout session'
    });
  }
});

// @route   POST /api/stripe/webhook
// @desc    Handle Stripe webhook events
// @access  Public (but verified)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment system not configured' });
  }
  
  const sig = req.headers['stripe-signature'];
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
        
      case 'payment_intent.succeeded':
        console.log('PaymentIntent succeeded:', event.data.object.id);
        break;
        
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Handle successful checkout
async function handleCheckoutSessionCompleted(session) {
  const purchaseId = parseInt(session.client_reference_id || session.metadata.purchaseId);
  
  if (!purchaseId) {
    console.error('No purchase ID in checkout session');
    return;
  }
  
  const purchase = await Purchase.findOne({ id: purchaseId });
  
  if (!purchase) {
    console.error('Purchase not found:', purchaseId);
    return;
  }
  
  // Update purchase
  purchase.status = 'Completed';
  purchase.completedAt = new Date().toISOString();
  purchase.stripePaymentId = session.payment_intent;
  purchase.transactionId = session.id;
  await purchase.save();
  
  // Grant role/access
  const product = await Product.findOne({ slug: purchase.productSlug });
  
  if (product && product.roleId) {
    const role = await Role.findOne({ id: product.roleId });
    
    if (role) {
      // Calculate expiry
      let expiresAt = null;
      if (purchase.durationDays && purchase.durationDays > 0) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + purchase.durationDays);
        expiresAt = expiry.toISOString();
      }
      
      // Assign role
      const userRole = new UserRole({
        userUid: purchase.userId,
        roleId: role.id,
        assignedBy: purchase.userId,
        expiresAt
      });
      
      await userRole.save();
      
      // Update purchase with expiry
      purchase.expiresAt = expiresAt;
      await purchase.save();
    }
  }
  
  // Create notification
  await Notification.createNotification(
    purchase.userId,
    'purchase',
    'Purchase Complete!',
    `Your purchase of ${product ? product.title : 'product'} has been completed successfully.`,
    {
      purchaseId: purchase.id,
      productSlug: purchase.productSlug,
      duration: purchase.duration
    },
    purchase.id,
    null
  );
  
  console.log('Purchase completed successfully:', purchaseId);
}

// Handle payment failure
async function handlePaymentFailed(paymentIntent) {
  console.log('Payment failed:', paymentIntent.id);
  
  // Try to find purchase by payment intent
  const purchase = await Purchase.findOne({
    stripePaymentId: paymentIntent.id
  });
  
  if (purchase) {
    purchase.status = 'Failed';
    purchase.notes = paymentIntent.last_payment_error?.message || 'Payment failed';
    await purchase.save();
    
    // Create notification
    await Notification.createNotification(
      purchase.userId,
      'purchase',
      'Payment Failed',
      'Your recent payment attempt has failed. Please try again.',
      { purchaseId: purchase.id },
      purchase.id,
      null
    );
  }
}

// @route   GET /api/stripe/session/:sessionId
// @desc    Get checkout session status
// @access  Private
router.get('/session/:sessionId', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: 'Payment system not configured'
      });
    }
    
    const { sessionId } = req.params;
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.payment_status,
        customer_email: session.customer_details?.email
      }
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching session'
    });
  }
});

export default router;

