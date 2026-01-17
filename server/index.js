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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ferdinandsz08_db_user:uDkMwUSdIHBerBQt@learningplatform.4l74fuy.mongodb.net/uottahack?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

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

