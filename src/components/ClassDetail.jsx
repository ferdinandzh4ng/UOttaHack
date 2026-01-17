import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CreateTaskModal from './CreateTaskModal';
import JoinClassModal from './JoinClassModal';
import AddStudentModal from './AddStudentModal';
import TaskViewModal from './TaskViewModal';
import './ClassDetail.css';

function ClassDetail() {
  console.log('[ClassDetail] Component rendering...');
  const { classId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [classData, setClassData] = useState(null);
  const [students, setStudents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Define fetchTasks before useEffect that uses it
  const fetchTasks = async () => {
    try {
      console.log(`[Tasks] Fetching tasks for class ${classId}...`);
      const response = await fetch(`/api/tasks/class/${classId}`);
      console.log(`[Tasks] Response status:`, response.status);
      const data = await response.json();
      console.log(`[Tasks] Response data:`, data);
      if (response.ok) {
        const tasksList = data.tasks || [];
        console.log(`[Tasks] Fetched ${tasksList.length} task(s):`, tasksList);
        tasksList.forEach((task, index) => {
          const status = task.type === 'Lesson' 
            ? task.lessonData?.status 
            : task.quizData?.status;
          console.log(`[Tasks] Task ${index + 1}:`, {
            id: task.id,
            topic: task.topic,
            type: task.type,
            status: status,
            hasSlides: task.type === 'Lesson' ? (task.lessonData?.slides?.length || 0) : 0,
            hasQuestions: task.type === 'Quiz' ? (task.quizData?.questions?.length || 0) : 0
          });
        });
        setTasks(tasksList);
      } else {
        console.error('[Tasks] Error fetching tasks:', data.error);
      }
    } catch (error) {
      console.error('[Tasks] Error fetching tasks:', error);
    }
  };

  useEffect(() => {
    console.log('[ClassDetail] Component mounted/updated, classId:', classId);
    const userData = localStorage.getItem('user');
    if (!userData) {
      console.log('[ClassDetail] No user data found, redirecting to home');
      navigate('/');
      return;
    }
    const userObj = JSON.parse(userData);
    console.log('[ClassDetail] User role:', userObj.role);
    setUser(userObj);
    
    // Fetch class data
    fetchClassData();
    
    // Fetch students if educator, check enrollment if student
    if (userObj.role === 'educator') {
      console.log('[ClassDetail] Educator - fetching students and tasks');
      fetchStudents();
      fetchTasks();
    } else if (userObj.role === 'student') {
      console.log('[ClassDetail] Student - checking enrollment and fetching tasks');
      checkEnrollment(userObj.id);
      fetchTasks();
    }
  }, [classId, navigate]);

  const fetchClassData = async () => {
    try {
      const response = await fetch(`/api/classes/${classId}`);
      const data = await response.json();
      if (response.ok) {
        setClassData(data.class);
      } else {
        console.error('Error fetching class:', data.error);
      }
    } catch (error) {
      console.error('Error fetching class:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await fetch(`/api/classes/${classId}/students`);
      const data = await response.json();
      if (response.ok) {
        setStudents(data.students || []);
      } else {
        console.error('Error fetching students:', data.error);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const checkEnrollment = async (studentId) => {
    try {
      // Get all classes for student and check if this class is in the list
      const response = await fetch(`/api/classes/student/${studentId}`);
      const data = await response.json();
      if (response.ok) {
        const enrolled = data.classes.some(cls => {
          const clsId = cls.id || cls._id;
          return clsId && (clsId.toString() === classId.toString());
        });
        setIsEnrolled(enrolled);
      }
    } catch (error) {
      console.error('Error checking enrollment:', error);
    }
  };

  // Poll for task updates if there are tasks that are pending or generating
  useEffect(() => {
    console.log('[ClassDetail] Polling effect triggered, tasks count:', tasks.length);
    // Check if there are active tasks
    const hasActiveTasks = tasks.some(task => {
      if (task.type === 'Lesson') {
        return task.lessonData?.status === 'pending' || task.lessonData?.status === 'generating';
      } else if (task.type === 'Quiz') {
        return task.quizData?.status === 'pending' || task.quizData?.status === 'generating';
      }
      return false;
    });

    console.log('[ClassDetail] Has active tasks:', hasActiveTasks);

    if (!hasActiveTasks && tasks.length === 0) {
      console.log('[ClassDetail] No active tasks and no tasks at all, skipping polling');
      return; // No tasks at all, no need to poll
    }

    console.log('[ClassDetail] Starting polling interval (every 3 seconds)');
    // Poll every 3 seconds for task updates
    const pollInterval = setInterval(() => {
      console.log('[ClassDetail] Polling interval triggered, fetching tasks...');
      fetchTasks();
    }, 3000);

    return () => {
      console.log('[ClassDetail] Cleaning up polling interval');
      clearInterval(pollInterval);
    };
  }, [tasks, classId]); // Re-check when tasks change

  const handleBack = () => {
    if (user?.role === 'educator') {
      navigate('/educator/home');
    } else {
      navigate('/dashboard/student');
    }
  };

  const handleCreateTask = () => {
    setShowCreateTaskModal(true);
  };

  const handleTaskCreated = () => {
    setShowCreateTaskModal(false);
    // Refresh tasks list
    fetchTasks();
  };

  const handleViewTask = async (task) => {
    // Fetch full task data including variants
    try {
      const response = await fetch(`/api/tasks/${task.id}`);
      const data = await response.json();
      if (response.ok) {
        setSelectedTask(data);
      } else {
        console.error('Error fetching task details:', data.error);
        // Fallback to basic task data
        setSelectedTask(task);
      }
    } catch (error) {
      console.error('Error fetching task details:', error);
      // Fallback to basic task data
      setSelectedTask(task);
    }
  };

  const handleCloseTaskView = () => {
    setSelectedTask(null);
  };

  const handleJoinClass = (enrollment) => {
    setShowJoinClassModal(false);
    setIsEnrolled(true);
    // Optionally refresh class data or show success message
    if (enrollment?.class?.id) {
      // Refresh to show updated enrollment status
      window.location.reload();
    }
  };

  const handleAddStudent = (enrollment) => {
    setShowAddStudentModal(false);
    // Refresh students list
    fetchStudents();
  };

  const handleDeleteStudent = async (studentId) => {
    if (window.confirm('Are you sure you want to remove this student from the class?')) {
      try {
        const response = await fetch(`/api/classes/${classId}/students/${studentId}`, {
          method: 'DELETE'
        });
        const data = await response.json();
        if (response.ok) {
          console.log('Student removed successfully:', data);
          // Refresh students list
          fetchStudents();
        } else {
          console.error('Error removing student:', data.error);
        }
      } catch (error) {
        console.error('Error removing student:', error);
      }
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE'
        });
        const data = await response.json();
        if (response.ok) {
          console.log('Task deleted successfully:', data);
          // Refresh tasks list
          fetchTasks();
        } else {
          console.error('Error deleting task:', data.error);
        }
      } catch (error) {
        console.error('Error deleting task:', error);
      }
    }
  };

  if (!user || loading) {
    return (
      <div className="class-detail">
        <div className="class-detail-content">
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="class-detail">
      <div className="class-detail-content">
        <div className="class-detail-header">
          <button className="back-btn" onClick={handleBack}>
            ← Back to Classes
          </button>
          <h1>Class Details</h1>
          <button className="logout-btn" onClick={() => {
            localStorage.removeItem('user');
            navigate('/');
          }}>
            Logout
          </button>
        </div>

        {classData && (
          <div className="class-info">
            <h2>{classData.subject}</h2>
            <p>Grade {classData.gradeLevel}</p>
            {classData.classCode && user?.role === 'educator' && (
              <p className="class-code">Class Code: <strong>{classData.classCode}</strong></p>
            )}
          </div>
        )}

        {user?.role === 'student' && !isEnrolled && (
          <div className="join-class-section">
            <button className="join-class-btn" onClick={() => setShowJoinClassModal(true)}>
              Join Class
            </button>
          </div>
        )}

        {user?.role === 'student' && isEnrolled && (
          <div className="enrolled-badge">
            <p>✓ You are enrolled in this class</p>
          </div>
        )}

        {user?.role === 'educator' && (
          <div className="students-section">
            <div className="students-header">
              <h2>Students</h2>
              <button className="add-student-btn" onClick={() => setShowAddStudentModal(true)}>
                + Add Student
              </button>
            </div>
            {students.length === 0 ? (
              <div className="no-students">
                <p>No students enrolled yet.</p>
              </div>
            ) : (
              <div className="students-list">
                {students.map((student) => (
                  <div key={student.id} className="student-card">
                    <div className="card-content">
                      <p>{student.username}</p>
                    </div>
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteStudent(student.id);
                      }}
                      title="Remove student"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(user?.role === 'educator' || (user?.role === 'student' && isEnrolled)) && (
          <div className="content-sections">
            {user?.role === 'educator' && (
              <div className="students-panel">
                <div className="panel-header">
                  <h2>Students</h2>
                  <button className="add-student-btn" onClick={() => setShowAddStudentModal(true)}>
                    + Add Student
                  </button>
                </div>
                {students.length === 0 ? (
                  <div className="no-content">
                    <p>No students enrolled yet.</p>
                  </div>
                ) : (
                  <div className="students-list">
                    {students.map((student) => (
                      <div key={student.id} className="student-card">
                        <div className="card-content">
                          <p>{student.username}</p>
                        </div>
                        <button
                          className="delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteStudent(student.id);
                          }}
                          title="Remove student"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="tasks-panel">
              <div className="panel-header">
                <h2>Tasks</h2>
                {user?.role === 'educator' && (
                  <button className="create-task-btn" onClick={handleCreateTask}>
                    + Create Task
                  </button>
                )}
              </div>
              {tasks.length === 0 ? (
                <div className="no-content">
                  <p>No tasks available yet.</p>
                </div>
              ) : (
                <div className="tasks-list">
                  {tasks.map((task) => (
                    <div key={task.id} className="task-card">
                      <div className="task-card-header">
                        <h3>{task.topic}</h3>
                        <div className="task-card-actions">
                          {user?.role === 'educator' && (
                            <button
                              className="delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTask(task.id);
                              }}
                              title="Delete task"
                            >
                              ✕
                            </button>
                          )}
                          <span className={`task-status task-status-${task.type === 'Lesson' ? task.lessonData?.status : task.quizData?.status}`}>
                            {task.type === 'Lesson' ? task.lessonData?.status || 'pending' : task.quizData?.status || 'pending'}
                          </span>
                        </div>
                      </div>
                      <div className="task-card-info">
                        <p className="task-type">{task.type}</p>
                        {task.type === 'Lesson' && task.length && (
                          <p className="task-length">{task.length} minutes</p>
                        )}
                        {task.type === 'Lesson' && task.lessonData?.slides && (
                          <p className="task-slides">{task.lessonData.slides.length} slides</p>
                        )}
                        {task.type === 'Quiz' && task.quizData?.numQuestions && (
                          <p className="task-questions">{task.quizData.numQuestions} questions</p>
                        )}
                        {task.variantCount > 0 && (
                          <p className="task-variants">{task.variantCount} variant{task.variantCount !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                      {(task.type === 'Lesson' ? task.lessonData?.status === 'completed' : task.quizData?.status === 'completed') && (
                        <button 
                          className="view-task-btn" 
                          onClick={() => handleViewTask(task)}
                        >
                          View {task.type === 'Lesson' ? 'Slides' : 'Quiz'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {showCreateTaskModal && (
        <CreateTaskModal
          classId={classId}
          onClose={() => setShowCreateTaskModal(false)}
          onSuccess={handleTaskCreated}
        />
      )}

      {showJoinClassModal && user && (
        <JoinClassModal
          studentId={user.id}
          onClose={() => setShowJoinClassModal(false)}
          onSuccess={handleJoinClass}
        />
      )}

      {showAddStudentModal && user && classData && (
        <AddStudentModal
          classId={classId}
          educatorId={user.id}
          onClose={() => setShowAddStudentModal(false)}
          onSuccess={handleAddStudent}
        />
      )}

      {selectedTask && (
        <TaskViewModal
          task={selectedTask}
          onClose={handleCloseTaskView}
        />
      )}
    </div>
  );
}

export default ClassDetail;

