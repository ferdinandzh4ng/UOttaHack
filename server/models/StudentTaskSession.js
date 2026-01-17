import mongoose from 'mongoose';

const vitalMetricsSchema = new mongoose.Schema({
  // Raw vitals from Presage SDK
  heartRate: {
    type: Number,
    default: null
  },
  breathingRate: {
    type: Number,
    default: null
  },
  // Derived metrics
  focusScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  engagementScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  thinkingIntensity: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const studentTaskSessionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  // Task metadata for analysis
  taskType: {
    type: String,
    enum: ['Lesson', 'Quiz'],
    required: true
  },
  gradeLevel: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  // AI models used for this task
  aiModels: {
    scriptModel: {
      provider: String,
      model: String,
      name: String
    },
    imageModel: {
      provider: String,
      model: String,
      name: String
    },
    quizPromptModel: {
      provider: String,
      model: String,
      name: String
    },
    quizQuestionsModel: {
      provider: String,
      model: String,
      name: String
    }
  },
  // Session timing
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active'
  },
  // Individual metric readings (for detailed analysis)
  metrics: [vitalMetricsSchema],
  // Aggregated metrics (averages for the session)
  aggregatedMetrics: {
    averageHeartRate: {
      type: Number,
      default: null
    },
    averageBreathingRate: {
      type: Number,
      default: null
    },
    averageFocusScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    averageEngagementScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    averageThinkingIntensity: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    // Standard deviations for variability analysis
    heartRateStdDev: {
      type: Number,
      default: null
    },
    breathingRateStdDev: {
      type: Number,
      default: null
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
studentTaskSessionSchema.index({ student: 1, task: 1, createdAt: -1 });
studentTaskSessionSchema.index({ task: 1, status: 1 });
studentTaskSessionSchema.index({ student: 1, taskType: 1, createdAt: -1 });
studentTaskSessionSchema.index({ 'aiModels.scriptModel.model': 1, taskType: 1 });
studentTaskSessionSchema.index({ 'aiModels.quizQuestionsModel.model': 1, taskType: 1 });

const StudentTaskSession = mongoose.model('StudentTaskSession', studentTaskSessionSchema);

export default StudentTaskSession;

