import express from 'express';
import teacherInsightsService from '../services/teacherInsightsService.js';

const router = express.Router();

/**
 * Get insights for a class
 * GET /api/insights/class/:classId
 */
router.get('/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { startDate, endDate, topic, subject } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    if (topic) filters.topic = topic;
    if (subject) filters.subject = subject;

    const insights = await teacherInsightsService.getClassInsights(classId, filters);

    res.json(insights);
  } catch (error) {
    console.error('[InsightsRoutes] Error getting class insights:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get insights for a specific task
 * GET /api/insights/task/:taskId
 */
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const insights = await teacherInsightsService.getTaskInsights(taskId);

    res.json(insights);
  } catch (error) {
    console.error('[InsightsRoutes] Error getting task insights:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

