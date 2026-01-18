import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Sentry from '@sentry/node';
import userRoutes from './routes/userRoutes.js';
import classRoutes from './routes/classRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import videoRoutes from './routes/videoRoutes.js';
import metricRoutes from './routes/metricRoutes.js';
import insightsRoutes from './routes/insightsRoutes.js';
import aiRouterService from './services/aiRouterService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (one level up from server directory)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Initialize Sentry
const SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.25, // 25% of successful transactions for free tier
    beforeSend(event, hint) {
      // Sample 100% of errors, reduce successful transactions
      if (event.level === 'error' || event.level === 'fatal') {
        return event;
      }
      return event;
    },
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app: express() }),
    ],
  });
  console.log('✅ Sentry initialized');
} else {
  console.warn('⚠️  SENTRY_DSN not set - Sentry monitoring disabled');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Sentry request handler must be first
if (SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// Middleware
app.use(cors());
// Increase body parser limit for video frames (10MB should be enough even for larger frames)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  retryWrites: true,
  w: 'majority'
};

// Connect to MongoDB (non-blocking for Vercel builds)
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, mongooseOptions)
    .then(() => {
      console.log('✅ Connected to MongoDB');
      console.log(`   Database: ${mongoose.connection.name}`);
    })
    .catch((error) => {
      console.error('❌ MongoDB connection error:', error.message);
      
      // Provide helpful error messages based on error type
      if (error.code === 8000 || error.codeName === 'AtlasError') {
        console.error('\n🔐 Authentication Error:');
        console.error('   - Check your MongoDB username and password');
        console.error('   - Verify your MongoDB Atlas user has proper permissions');
        console.error('   - Ensure your IP address is whitelisted in MongoDB Atlas');
        console.error('   - Check if your password contains special characters that need URL encoding');
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error('\n🔌 Connection Refused:');
        console.error('   - Check if MongoDB is running');
        console.error('   - Verify the connection string host and port');
        console.error('   - For local MongoDB: mongodb://localhost:27017/uottahack');
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        console.error('\n🌐 DNS/Network Error:');
        console.error('   - Check your internet connection');
        console.error('   - Verify the MongoDB hostname is correct');
        console.error('   - For MongoDB Atlas, check if the cluster is accessible');
      }
      
      console.error('\n💡 To fix:');
      console.error('   1. Set MONGODB_URI in your environment variables');
      console.error('   2. For Vercel: Add it in Project Settings → Environment Variables');
      console.error('   3. Restart the server');
      
      // Don't exit the process - let the server start but operations will fail
      // This allows the server to start even if MongoDB isn't available (important for Vercel builds)
    });
} else {
  console.warn('⚠️  MONGODB_URI not set - MongoDB operations will fail');
  console.warn('   Set MONGODB_URI in your environment variables for production');
}

// Initialize AI Router Service (SAM)
aiRouterService.initialize().catch(err => {
  console.warn('AI Router initialization failed, will use direct calls:', err.message);
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/insights', insightsRoutes);

// Import analytics routes
import analyticsRoutes from './routes/analyticsRoutes.js';
app.use('/api/analytics', analyticsRoutes);

// API endpoint to get routing configuration
app.get('/api/ai-router/config', async (req, res) => {
  try {
    const routingConfig = await aiRouterService.getRoutingConfig();
    res.json({
      routingConfig,
      isInitialized: aiRouterService.isInitialized
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to update routing configuration
app.post('/api/ai-router/config', async (req, res) => {
  try {
    const { taskType, provider } = req.body;
    const success = aiRouterService.updateRoutingConfig(taskType, provider);
    if (success) {
      res.json({ message: 'Routing configuration updated', taskType, provider });
    } else {
      res.status(400).json({ error: 'Invalid task type or provider' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Don't serve static files in Vercel - Vercel handles this via rewrites
// Only serve static files if running locally in production mode
if (process.env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  
  // Handle React Router - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

// Sentry error handler must be after routes
if (SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Only listen on PORT if not in Vercel (Vercel handles this)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel serverless
export default app;
export { Sentry };

