import express from 'express';
import Class from '../models/Class.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';

const router = express.Router();

// Helper function to generate unique class code
const generateClassCode = async () => {
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    // Generate a 6-character alphanumeric code
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const existingClass = await Class.findOne({ classCode: code });
    if (!existingClass) {
      isUnique = true;
    }
  }
  
  return code;
};

// Create a new class
router.post('/create', async (req, res) => {
  try {
    const { gradeLevel, subject, educatorId } = req.body;

    if (!gradeLevel || !subject || !educatorId) {
      return res.status(400).json({ error: 'Grade level, subject, and educator ID are required' });
    }

    // Generate unique class code
    const classCode = await generateClassCode();

    // Create new class
    const newClass = new Class({
      gradeLevel,
      subject,
      educator: educatorId,
      classCode
    });

    await newClass.save();

    res.status(201).json({
      message: 'Class created successfully',
      class: {
        id: newClass._id,
        gradeLevel: newClass.gradeLevel,
        subject: newClass.subject,
        educator: newClass.educator,
        classCode: newClass.classCode,
        createdAt: newClass.createdAt
      }
    });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ error: 'Server error during class creation' });
  }
});

// Get all classes for an educator
router.get('/educator/:educatorId', async (req, res) => {
  try {
    const { educatorId } = req.params;

    const classes = await Class.find({ educator: educatorId })
      .sort({ createdAt: -1 })
      .populate('educator', 'username');

    // Convert _id to id for consistency
    const formattedClasses = classes.map(cls => ({
      id: cls._id,
      gradeLevel: cls.gradeLevel,
      subject: cls.subject,
      educator: cls.educator,
      classCode: cls.classCode,
      createdAt: cls.createdAt
    }));

    res.json({ classes: formattedClasses });
  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({ error: 'Server error fetching classes' });
  }
});

// Get a single class by ID
router.get('/:classId', async (req, res) => {
  try {
    const { classId } = req.params;

    const classData = await Class.findById(classId)
      .populate('educator', 'username');

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    res.json({
      class: {
        id: classData._id,
        gradeLevel: classData.gradeLevel,
        subject: classData.subject,
        educator: classData.educator,
        classCode: classData.classCode,
        createdAt: classData.createdAt
      }
    });
  } catch (error) {
    console.error('Get class error:', error);
    res.status(500).json({ error: 'Server error fetching class' });
  }
});

// Enroll a student in a class
router.post('/:classId/enroll', async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    // Check if class exists
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      class: classId
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Student is already enrolled in this class' });
    }

    // Create enrollment
    const enrollment = new Enrollment({
      student: studentId,
      class: classId
    });

    await enrollment.save();

    res.status(201).json({
      message: 'Student enrolled successfully',
      enrollment: {
        id: enrollment._id,
        student: enrollment.student,
        class: enrollment.class,
        enrolledAt: enrollment.enrolledAt
      }
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Student is already enrolled in this class' });
    }
    res.status(500).json({ error: 'Server error during enrollment' });
  }
});

// Get enrolled students for a class
router.get('/:classId/students', async (req, res) => {
  try {
    const { classId } = req.params;

    const enrollments = await Enrollment.find({ class: classId })
      .populate('student', 'username email')
      .sort({ enrolledAt: -1 });

    const students = enrollments.map(e => ({
      id: e.student._id,
      username: e.student.username,
      email: e.student.email,
      enrolledAt: e.enrolledAt
    }));

    res.json({ students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Server error fetching students' });
  }
});

// Unenroll a student from a class
router.delete('/:classId/enroll/:studentId', async (req, res) => {
  try {
    const { classId, studentId } = req.params;

    const enrollment = await Enrollment.findOneAndDelete({
      student: studentId,
      class: classId
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json({ message: 'Student unenrolled successfully' });
  } catch (error) {
    console.error('Unenrollment error:', error);
    res.status(500).json({ error: 'Server error during unenrollment' });
  }
});

// Join a class by class code
router.post('/join/code', async (req, res) => {
  try {
    const { classCode, studentId } = req.body;

    if (!classCode || !studentId) {
      return res.status(400).json({ error: 'Class code and student ID are required' });
    }

    // Find class by code
    const classData = await Class.findOne({ classCode: classCode.toUpperCase() });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found with the provided code' });
    }

    // Check if student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if student is already enrolled
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      class: classData._id
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'You are already enrolled in this class' });
    }

    // Create enrollment
    const enrollment = new Enrollment({
      student: studentId,
      class: classData._id
    });

    await enrollment.save();

    // Populate class details for response
    await enrollment.populate('class', 'gradeLevel subject educator classCode');

    res.status(201).json({
      message: 'Successfully joined class',
      enrollment: {
        id: enrollment._id,
        student: enrollment.student,
        class: {
          id: enrollment.class._id,
          gradeLevel: enrollment.class.gradeLevel,
          subject: enrollment.class.subject,
          classCode: enrollment.class.classCode
        },
        enrolledAt: enrollment.enrolledAt
      }
    });
  } catch (error) {
    console.error('Join class by code error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'You are already enrolled in this class' });
    }
    res.status(500).json({ error: 'Server error joining class' });
  }
});

// Join a class by username invitation (educator invites student)
router.post('/join/invite', async (req, res) => {
  try {
    const { classId, username, educatorId } = req.body;

    if (!classId || !username || !educatorId) {
      return res.status(400).json({ error: 'Class ID, username, and educator ID are required' });
    }

    // Find class and verify educator owns it
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    if (classData.educator.toString() !== educatorId) {
      return res.status(403).json({ error: 'Only the class educator can invite students' });
    }

    // Find student by username
    const student = await User.findOne({ username: username.trim(), role: 'student' });
    if (!student) {
      return res.status(404).json({ error: 'Student not found with the provided username' });
    }

    // Check if student is already enrolled
    const existingEnrollment = await Enrollment.findOne({
      student: student._id,
      class: classId
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Student is already enrolled in this class' });
    }

    // Create enrollment
    const enrollment = new Enrollment({
      student: student._id,
      class: classId
    });

    await enrollment.save();

    // Populate details for response
    await enrollment.populate('student', 'username');
    await enrollment.populate('class', 'gradeLevel subject classCode');

    res.status(201).json({
      message: 'Student successfully invited and enrolled',
      enrollment: {
        id: enrollment._id,
        student: {
          id: enrollment.student._id,
          username: enrollment.student.username
        },
        class: {
          id: enrollment.class._id,
          gradeLevel: enrollment.class.gradeLevel,
          subject: enrollment.class.subject,
          classCode: enrollment.class.classCode
        },
        enrolledAt: enrollment.enrolledAt
      }
    });
  } catch (error) {
    console.error('Join class by invitation error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Student is already enrolled in this class' });
    }
    res.status(500).json({ error: 'Server error inviting student' });
  }
});

// Get all classes a student is enrolled in
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const enrollments = await Enrollment.find({ student: studentId })
      .populate('class', 'gradeLevel subject educator classCode')
      .populate('class.educator', 'username')
      .sort({ enrolledAt: -1 });

    const classes = enrollments.map(e => ({
      id: e.class._id,
      gradeLevel: e.class.gradeLevel,
      subject: e.class.subject,
      educator: e.class.educator,
      classCode: e.class.classCode,
      enrolledAt: e.enrolledAt
    }));

    res.json({ classes });
  } catch (error) {
    console.error('Get student classes error:', error);
    res.status(500).json({ error: 'Server error fetching student classes' });
  }
});

export default router;

