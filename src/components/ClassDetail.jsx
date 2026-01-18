import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import CreateTaskModal from './CreateTaskModal';
import JoinClassModal from './JoinClassModal';
import AddStudentModal from './AddStudentModal';
import TaskViewModal from './TaskViewModal';
import './ClassDetail.css';

function ClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [performance, setPerformance] = useState(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // Define fetchTasks before useEffect that uses it
  const fetchTasks = async () => {
    try {
      // For students, pass studentId to filter out completed quizzes
      const userData = localStorage.getItem('user');
      const userObj = userData ? JSON.parse(userData) : null;
      const studentId = userObj?.role === 'student' ? userObj.id : null;
      
      const url = studentId 
        ? `/api/tasks/class/${classId}?studentId=${studentId}`
        : `/api/tasks/class/${classId}`;
      
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) {
        const tasksList = data.tasks || [];
        tasksList.forEach((task, index) => {
          const status = task.type === 'Lesson' 
            ? task.lessonData?.status 
            : task.quizData?.status;
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
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }
    const userObj = JSON.parse(userData);
    setUser(userObj);
    
    // Fetch class data
    fetchClassData();
    
    // Fetch students if educator, check enrollment if student
    if (userObj.role === 'educator') {
      fetchStudents();
      fetchTasks();
      fetchPerformanceData();
    } else if (userObj.role === 'student') {
      checkEnrollment(userObj.id);
      fetchTasks();
    }
  }, [classId, navigate]);

  // Handle task ID from URL params - open task modal automatically
  useEffect(() => {
    const taskIdFromUrl = searchParams.get('task');
    if (taskIdFromUrl && tasks.length > 0 && user && !selectedTask) {
      const taskToOpen = tasks.find(t => 
        t.id === taskIdFromUrl || 
        t._id === taskIdFromUrl ||
        t.id?.toString() === taskIdFromUrl ||
        t._id?.toString() === taskIdFromUrl
      );
      if (taskToOpen) {
        // For students, fetch their assigned variant; for educators, fetch all variants
        const openTask = async () => {
          try {
            let response;
            if (user.role === 'student') {
              response = await fetch(`/api/tasks/${taskToOpen.id || taskToOpen._id}/student/${user.id}`);
            } else {
              response = await fetch(`/api/tasks/${taskToOpen.id || taskToOpen._id}`);
            }
            
            const data = await response.json();
            if (response.ok) {
              setSelectedTask(data);
            } else {
              setSelectedTask(taskToOpen);
            }
          } catch (error) {
            setSelectedTask(taskToOpen);
          }
          // Remove task from URL to clean it up
          navigate(`/class/${classId}`, { replace: true });
        };
        openTask();
      }
    }
  }, [tasks, searchParams, user, classId, navigate, selectedTask]);

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

  const fetchPerformanceData = async () => {
    try {
      setLoadingPerformance(true);
      const response = await fetch('/api/analytics/performance?timeRange=30d');
      if (response.ok) {
        const data = await response.json();
        setPerformance(data);
      } else {
        console.warn('Performance data not available');
        setPerformance({ agentPerformance: [], timeSeries: [] });
      }
    } catch (error) {
      console.warn('Error fetching performance data:', error);
      setPerformance({ agentPerformance: [], timeSeries: [] });
    } finally {
      setLoadingPerformance(false);
    }
  };

  const formatAgentName = (agentCombo) => {
    if (!agentCombo) return 'Unknown';
    const parts = agentCombo.split(' + ');
    if (parts.length !== 2) return agentCombo;
    
    const formatModel = (modelStr) => {
      if (!modelStr) return 'undefined';
      const parts = modelStr.split(' ');
      if (parts.length >= 2) {
        return `${parts[0]} ${parts[parts.length - 1]}`;
      }
      return modelStr;
    };
    
    return `${formatModel(parts[0])} + ${formatModel(parts[1])}`;
  };

  const preparePerformanceTimeSeries = () => {
    if (!performance?.timeSeries || performance.timeSeries.length === 0) return [];
    
    return performance.timeSeries.map(point => ({
      date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      clarity: Math.round(point.avgClarity * 100),
      engagement: Math.round(point.avgEngagement * 100),
      confidence: Math.round(point.avgConfidence * 100),
    }));
  };

  const prepareAgentPerformanceData = () => {
    if (!performance?.agentPerformance || performance.agentPerformance.length === 0) return [];
    
    return performance.agentPerformance
      .sort((a, b) => {
        const totalA = (a.avgClarity + a.avgEngagement + a.avgConfidence) / 3;
        const totalB = (b.avgClarity + b.avgEngagement + b.avgConfidence) / 3;
        return totalB - totalA;
      })
      .slice(0, 10)
      .map(agent => ({
        agent: formatAgentName(agent.agentCombo),
        agentComboFull: agent.agentCombo || 'Unknown',
        clarity: Math.round(agent.avgClarity * 100),
        engagement: Math.round(agent.avgEngagement * 100),
        confidence: Math.round(agent.avgConfidence * 100),
        sessions: agent.totalSessions,
      }));
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
    // Check if there are active tasks
    const hasActiveTasks = tasks.some(task => {
      if (task.type === 'Lesson') {
        return task.lessonData?.status === 'pending' || task.lessonData?.status === 'generating';
      } else if (task.type === 'Quiz') {
        return task.quizData?.status === 'pending' || task.quizData?.status === 'generating';
      }
      return false;
    });


    if (!hasActiveTasks && tasks.length === 0) {
      return; // No tasks at all, no need to poll
    }

    // Poll every 3 seconds for task updates
    const pollInterval = setInterval(() => {
      fetchTasks();
    }, 3000);

    return () => {
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
    // For students, fetch their assigned variant; for educators, fetch all variants
    try {
      let response;
      if (user?.role === 'student') {
        // Fetch student's assigned variant
        response = await fetch(`/api/tasks/${task.id}/student/${user.id}`);
      } else {
        // Fetch full task data including variants for educators
        response = await fetch(`/api/tasks/${task.id}`);
      }
      
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
    // Refresh tasks list after closing modal (in case quiz was submitted)
    if (user?.role === 'student') {
      fetchTasks();
    }
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

  const handleKickStudent = async (studentId) => {
    if (!window.confirm('Are you sure you want to remove this student from the class?')) {
      return;
    }

    try {
      const response = await fetch(`/api/classes/${classId}/enroll/${studentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh students list
        fetchStudents();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to remove student');
      }
    } catch (error) {
      console.error('Error removing student:', error);
      alert('Failed to remove student');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task? This will also delete all variants.')) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh tasks list
        fetchTasks();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
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
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {user?.role === 'developer' && (
              <button 
                onClick={() => navigate('/analytics')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #667eea',
                  backgroundColor: '#667eea',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                📊 Analytics
              </button>
            )}
            <button className="logout-btn" onClick={() => {
              localStorage.removeItem('user');
              navigate('/');
            }}>
              Logout
            </button>
          </div>
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
          <>
            <div className="content-sections">
              <div className="students-panel">
                <div className="panel-header">
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
                          className="kick-btn" 
                          onClick={() => handleKickStudent(student.id)}
                          title="Remove student from class"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="tasks-panel">
                <div className="panel-header">
                  <h2>Tasks</h2>
                  <button className="create-task-btn" onClick={handleCreateTask}>
                    + Create Task
                  </button>
                </div>
                {tasks.length === 0 ? (
                  <div className="no-tasks">
                    <p>No tasks available yet.</p>
                  </div>
                ) : (
                  <div className="tasks-list">
                    {tasks.map((task) => (
                      <div key={task.id} className="task-card">
                        <div className="task-card-header">
                          <h3>{task.topic}</h3>
                          <div className="task-card-actions">
                            <span className={`task-status task-status-${task.type === 'Lesson' ? task.lessonData?.status : task.quizData?.status}`}>
                              {task.type === 'Lesson' ? task.lessonData?.status || 'pending' : task.quizData?.status || 'pending'}
                            </span>
                            <button 
                              className="delete-task-btn" 
                              onClick={() => handleDeleteTask(task.id)}
                              title="Delete task"
                            >
                              ×
                            </button>
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

            {/* Performance Charts - Only for educators */}
            {performance && (performance.timeSeries?.length > 0 || performance.agentPerformance?.length > 0) && (
              <div className="performance-charts-section" style={{ 
                marginTop: '2rem', 
                padding: '2rem', 
                backgroundColor: '#f9fafb', 
                borderRadius: '12px',
                width: '100%'
              }}>
                <h2 style={{ marginBottom: '2rem', color: '#374151' }}>Class Performance Analytics</h2>
                
                {/* Student Feedback Metrics Over Time */}
                {performance.timeSeries && performance.timeSeries.length > 0 && (
                  <div style={{ marginBottom: '3rem', backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3 style={{ marginBottom: '1rem', color: '#374151' }}>Student Feedback Metrics Over Time (%)</h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={preparePerformanceTimeSeries()} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                        <defs>
                          <linearGradient id="colorClarity" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#667eea" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#667eea" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#764ba2" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#764ba2" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f093fb" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#f093fb" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { fontSize: '14px', fontWeight: 600 } }}
                          tick={{ fontSize: 12, fill: '#374151' }}
                        />
                        <YAxis 
                          domain={[0, 100]} 
                          label={{ value: 'Score (%)', angle: -90, position: 'insideLeft', style: { fontSize: '14px', fontWeight: 600 } }}
                          tick={{ fontSize: 12, fill: '#374151' }}
                        />
                        <Tooltip 
                          formatter={(value, name) => [`${value}%`, name]}
                          contentStyle={{ fontSize: '13px', padding: '10px', borderRadius: '8px' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Area type="monotone" dataKey="clarity" stroke="#667eea" fillOpacity={1} fill="url(#colorClarity)" name="Clarity" />
                        <Area type="monotone" dataKey="engagement" stroke="#764ba2" fillOpacity={1} fill="url(#colorEngagement)" name="Engagement" />
                        <Area type="monotone" dataKey="confidence" stroke="#f093fb" fillOpacity={1} fill="url(#colorConfidence)" name="Confidence" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Agent Performance by Feedback Score */}
                {performance.agentPerformance && performance.agentPerformance.length > 0 && (
                  <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3 style={{ marginBottom: '1rem', color: '#374151' }}>Agent Performance by Feedback Score (%)</h3>
                    <ResponsiveContainer width="100%" height={Math.max(350, prepareAgentPerformanceData().length * 45)}>
                      <BarChart data={prepareAgentPerformanceData()} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          type="number" 
                          domain={[0, 100]} 
                          label={{ value: 'Score (%)', position: 'insideBottom', offset: -5, style: { fontSize: '14px', fontWeight: 600 } }}
                          tick={{ fontSize: 12, fill: '#374151' }}
                        />
                        <YAxis 
                          dataKey="agent" 
                          type="category" 
                          width={280}
                          tick={{ fontSize: 10, fill: '#374151', fontWeight: 500 }}
                          interval={0}
                        />
                        <Tooltip 
                          formatter={(value, name) => [`${value.toFixed(1)}%`, name]}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0] && payload[0].payload.agentComboFull) {
                              return payload[0].payload.agentComboFull;
                            }
                            return label;
                          }}
                          contentStyle={{ fontSize: '13px', padding: '10px', borderRadius: '8px', maxWidth: '400px' }}
                        />
                        <Legend 
                          wrapperStyle={{ paddingTop: '20px' }}
                          iconType="square"
                        />
                        <Bar dataKey="clarity" stackId="a" fill="#667eea" name="Clarity" />
                        <Bar dataKey="engagement" stackId="a" fill="#764ba2" name="Engagement" />
                        <Bar dataKey="confidence" stackId="a" fill="#f093fb" name="Confidence" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {loadingPerformance && (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    Loading performance data...
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {(user?.role === 'student' && isEnrolled) && (
          <div className="tasks-section">
            <div className="tasks-header">
              <h2>Tasks</h2>
            </div>
            {tasks.length === 0 ? (
              <div className="no-tasks">
                <p>No tasks available yet.</p>
              </div>
            ) : (
              <div className="tasks-list">
                {tasks.map((task) => (
                  <div key={task.id} className="task-card">
                    <div className="task-card-header">
                      <h3>{task.topic}</h3>
                      <span className={`task-status task-status-${task.type === 'Lesson' ? task.lessonData?.status : task.quizData?.status}`}>
                        {task.type === 'Lesson' ? task.lessonData?.status || 'pending' : task.quizData?.status || 'pending'}
                      </span>
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
