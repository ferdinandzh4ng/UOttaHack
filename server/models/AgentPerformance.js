import mongoose from 'mongoose';

/**
 * Agent Performance Model
 * Stores performance profiles for AI model combinations
 * Used by the AI Agent Selection Engine
 */
const agentPerformanceSchema = new mongoose.Schema({
  // Agent combination identifier
  agentCombo: {
    type: String,
    required: true,
    index: true
  },
  
  // Task context
  topic: {
    type: String,
    required: true,
    index: true
  },
  
  purpose: {
    type: String,
    enum: ['Conceptual', 'Assessment', 'Practice', 'Review'],
    required: true
  },
  
  length: {
    type: String,
    enum: ['Short', 'Medium', 'Long', 'Unknown'],
    default: 'Unknown'
  },
  
  taskType: {
    type: String,
    enum: ['Lesson', 'Quiz'],
    required: true,
    index: true
  },
  
  gradeLevel: {
    type: String,
    index: true
  },
  
  subject: {
    type: String,
    index: true
  },
  
  // Performance metrics (averaged from feedback)
  avgClarity: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  
  avgEngagement: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  
  avgConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  
  avgAttentionSpan: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  
  fatigueSlope: {
    type: Number,
    default: 0 // Positive = rising fatigue, negative = falling
  },
  
  // Sample size
  sessionCount: {
    type: Number,
    default: 0
  },
  
  // Timestamps
  firstSeen: {
    type: Date,
    default: Date.now
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // Status (for A/B testing)
  status: {
    type: String,
    enum: ['active', 'deprecated', 'experimental'],
    default: 'active'
  },
  
  // Combined performance score (for quick ranking)
  performanceScore: {
    type: Number,
    default: 0.5,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
agentPerformanceSchema.index({ agentCombo: 1, topic: 1, purpose: 1, length: 1 });
agentPerformanceSchema.index({ taskType: 1, gradeLevel: 1, subject: 1, performanceScore: -1 });
agentPerformanceSchema.index({ status: 1, performanceScore: -1 });

// Calculate and update performance score before saving
agentPerformanceSchema.pre('save', function(next) {
  // Weighted combination of metrics
  this.performanceScore = (
    (this.avgClarity * 0.3) +
    (this.avgEngagement * 0.3) +
    (this.avgConfidence * 0.2) +
    (this.avgAttentionSpan * 0.2)
  );
  
  // Penalize rising fatigue
  if (this.fatigueSlope > 0.1) {
    this.performanceScore *= 0.9;
  }
  
  this.lastUpdated = new Date();
  next();
});

const AgentPerformance = mongoose.model('AgentPerformance', agentPerformanceSchema);

export default AgentPerformance;

