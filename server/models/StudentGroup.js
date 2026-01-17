import mongoose from 'mongoose';

const studentGroupSchema = new mongoose.Schema({
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
  groupNumber: {
    type: Number,
    required: true
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  // AI model combination assigned to this group
  aiCombo: {
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
  // Task variant generated with this combo (same task, different AI generation)
  taskVariantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
studentGroupSchema.index({ task: 1, groupNumber: 1 });

const StudentGroup = mongoose.model('StudentGroup', studentGroupSchema);

export default StudentGroup;

