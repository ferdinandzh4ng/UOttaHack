import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import userRoutes from './routes/userRoutes.js';
import classRoutes from './routes/classRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import videoRoutes from './routes/videoRoutes.js';
import aiRouterService from './services/aiRouterService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set!');
  console.error('   Please set MONGODB_URI in your .env file or environment variables.');
  console.error('   Example: MONGODB_URI=mongodb://localhost:27017/uottahack');
  console.error('   Or for MongoDB Atlas: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database');
  process.exit(1);
}

// MongoDB connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  retryWrites: true,
  w: 'majority'
};

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
    console.error('   1. Create a .env file in the project root');
    console.error('   2. Add: MONGODB_URI=your_connection_string_here');
    console.error('   3. Restart the server');
    
    // Don't exit the process - let the server start but operations will fail
    // This allows the server to start even if MongoDB isn't available
  });

// Initialize AI Router Service (SAM)
aiRouterService.initialize().catch(err => {
  console.warn('AI Router initialization failed, will use direct calls:', err.message);
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/video', videoRoutes);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

