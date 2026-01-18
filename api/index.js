// Vercel serverless function entry point
import app from '../server/index.js';

// Vercel expects a handler function
export default (req, res) => {
  return app(req, res);
};

