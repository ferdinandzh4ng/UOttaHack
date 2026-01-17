import mongoose from 'mongoose';

const slideSchema = new mongoose.Schema({
  slideNumber: {
    type: Number,
    required: true
  },
  script: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  speechUrl: {
    type: String,
    default: ''
  }
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionNumber: {
    type: Number,
    required: true
  },
  question: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'True/False', 'Short Answer'],
    required: true
  },
  options: [{
    type: String
  }],
  correctAnswer: {
    type: String,
    required: true
  },
  explanation: {
    type: String,
    default: ''
  }
}, { _id: false });

const taskSchema = new mongoose.Schema({
  length: {
    type: Number,
    min: 1
  },
  type: {
    type: String,
    enum: ['Lesson', 'Quiz'],
    required: true
  },
  topic: {
    type: String,
    required: true,
    trim: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  // Lesson-specific fields
  lessonData: {
    script: {
      type: String,
      default: ''
    },
    slides: [slideSchema],
    status: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending'
    }
  },
  // Quiz-specific fields
  quizData: {
    prompt: {
      type: String,
      default: ''
    },
    questionType: {
      type: String,
      enum: ['MCQ', 'True/False', 'Short Answer', 'Mixed'],
      default: 'MCQ'
    },
    numQuestions: {
      type: Number,
      default: 5,
      min: 1,
      max: 50
    },
    questions: [questionSchema],
    status: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending'
    }
  },
  // Track which AI models were used to generate this task
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
  // Reference to parent task if this is a variant
  parentTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  // Group this task variant is assigned to
  assignedGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentGroup',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes to improve query performance and prevent sort memory issues
taskSchema.index({ class: 1, parentTask: 1, createdAt: -1 }); // For /class/:classId query
taskSchema.index({ parentTask: 1, createdAt: 1 }); // For variant queries
taskSchema.index({ createdAt: -1 }); // General sorting index

const Task = mongoose.model('Task', taskSchema);

export default Task;

