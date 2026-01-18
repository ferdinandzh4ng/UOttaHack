import mongoose from 'mongoose';

/**
 * Session Feedback Model
 * Stores normalized feedback signals (not raw metrics)
 * This is the "feedback layer" output
 */
const sessionFeedbackSchema = new mongoose.Schema({
  // Link to session
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentTaskSession',
    required: true,
    index: true
  },
  
  // Feedback signals (normalized from raw metrics)
  clarityScore: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  
  engagementScore: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  
  fatigueTrend: {
    type: String,
    enum: ['rising', 'stable', 'falling'],
    default: 'stable'
  },
  
  cognitiveLoad: {
    type: Number,
    min: 0,
    max: 1
  },
  
  attentionSpan: {
    type: Number,
    min: 0,
    max: 1
  },
  
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  
  fatigueSlope: {
    type: Number,
    default: 0
  },
  
  // Session context
  agentCombo: {
    type: String,
    required: true,
    index: true
  },
  
  topic: {
    type: String,
    index: true
  },
  
  taskType: {
    type: String,
    enum: ['Lesson', 'Quiz'],
    index: true
  },
  
  gradeLevel: String,
  subject: String,
  
  // Survey Monkey integration
  surveyMonkeyResponseId: {
    type: String,
    index: true
  },
  
  surveySubmitted: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
sessionFeedbackSchema.index({ agentCombo: 1, topic: 1, createdAt: -1 });
sessionFeedbackSchema.index({ taskType: 1, gradeLevel: 1, subject: 1 });

const SessionFeedback = mongoose.model('SessionFeedback', sessionFeedbackSchema);

export default SessionFeedback;

