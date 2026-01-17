import mongoose from 'mongoose';

const classSchema = new mongoose.Schema({
  gradeLevel: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  educator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  classCode: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    uppercase: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Class = mongoose.model('Class', classSchema);

export default Class;

