import express from 'express';

const router = express.Router();

// Placeholder routes for video functionality
// TODO: Implement video routes as needed

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'video' });
});

export default router;
