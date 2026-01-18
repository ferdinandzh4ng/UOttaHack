import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import TaskViewModal from './TaskViewModal';
import './Dashboard.css';

function Dashboard() {
  const { role } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [classCode, setClassCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loadingTask, setLoadingTask] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }
    const userObj = JSON.parse(userData);
    setUser(userObj);

    // Redirect developers to analytics
    if (userObj.role === 'developer') {
      navigate('/analytics');
      return;
    }

    // Fetch classes and tasks if student
    if (userObj.role === 'student') {
      fetchStudentData(userObj.id);
    } else {
      setLoading(false);
    }
  }, [navigate]);

  const fetchStudentData = async (studentId) => {
    try {
      // Fetch classes
      const classesResponse = await fetch(`/api/classes/student/${studentId}`);
      const classesData = await classesResponse.json();
      if (classesResponse.ok) {
        setClasses(classesData.classes || []);
      }

      // Fetch tasks
      const tasksResponse = await fetch(`/api/tasks/student/${studentId}`);
      const tasksData = await tasksResponse.json();
      if (tasksResponse.ok) {
        setTasks(tasksData.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const handleClassClick = (classId) => {
    navigate(`/class/${classId}`);
  };

  const handleTaskClick = async (task) => {
    setLoadingTask(true);
    try {
      // Fetch full task data for the student
      const response = await fetch(`/api/tasks/${task.id}/student/${user.id}`);
      const data = await response.json();
      if (response.ok) {
        setSelectedTask(data);
      } else {
        // Fallback to basic task data
        setSelectedTask(task);
      }
    } catch (error) {
      console.error('Error fetching task details:', error);
      // Fallback to basic task data
      setSelectedTask(task);
    } finally {
      setLoadingTask(false);
    }
  };

  const handleCloseTaskView = () => {
    setSelectedTask(null);
    // Refresh tasks list after closing modal (in case quiz was submitted)
    if (user?.role === 'student' && user?.id) {
      fetchStudentData(user.id);
    }
  };

  const handleJoinClass = () => {
    setShowJoinModal(true);
    setClassCode('');
    setJoinError('');
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    setJoinError('');
    setJoining(true);

    try {
      const response = await fetch('/api/classes/join/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classCode: classCode.toUpperCase().trim(),
          studentId: user.id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Refresh classes list
        await fetchStudentData(user.id);
        setShowJoinModal(false);
        setClassCode('');
      } else {
        setJoinError(data.error || 'Failed to join class');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      setJoinError('Network error. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const getTaskStatus = (task) => {
    if (task.status === 'completed') return 'completed';
    if (task.status === 'generating') return 'generating';
    if (task.status === 'failed') return 'failed';
    return 'pending';
  };

  if (!user || loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-content">
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // Student dashboard
  if (user.role === 'student') {
    return (
      <div className="dashboard">
        <div className="dashboard-content">
          <div className="dashboard-header">
            <h1>Welcome, {user.username}!</h1>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {user.role === 'developer' && (
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
              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>

          {/* Two-column layout: Classes (2/3) and Tasks (1/3) */}
          <div className="student-dashboard-layout">
            {/* Classes Section - Left (2/3 width) */}
            <div className="classes-column">
              <div className="section-header">
                <h2>My Classes</h2>
                <button className="join-class-btn" onClick={handleJoinClass}>
                  + Join Class
                </button>
              </div>
              {classes.length === 0 ? (
                <div className="empty-state">
                  <p>You're not enrolled in any classes yet.</p>
                  <p className="empty-state-hint">Join a class using a class code or wait for an invitation from your educator.</p>
                </div>
              ) : (
                <div className="classes-list">
                  {classes.map((classItem) => (
                    <div 
                      key={classItem.id} 
                      className="class-card"
                      onClick={() => handleClassClick(classItem.id)}
                    >
                      <div className="class-card-header">
                        <h3>{classItem.subject}</h3>
                        <span className="class-code-badge">{classItem.classCode}</span>
                      </div>
                      <div className="class-card-info">
                        <p>Grade {classItem.gradeLevel}</p>
                        <p className="class-educator">Educator: {classItem.educator?.username || 'Unknown'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tasks Section - Right (1/3 width) */}
            <div className="tasks-column">
              <div className="section-header">
                <h2>My Tasks</h2>
              </div>
              {tasks.length === 0 ? (
                <div className="empty-state">
                  <p>No tasks assigned yet.</p>
                  <p className="empty-state-hint">Tasks will appear here once your educator creates them.</p>
                </div>
              ) : (
                <div className="tasks-list">
                  {tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="task-card"
                      onClick={() => handleTaskClick(task)}
                    >
                      <div className="task-card-header">
                        <h3>{task.topic}</h3>
                        <span className={`task-status task-status-${getTaskStatus(task)}`}>
                          {task.status}
                        </span>
                      </div>
                      <div className="task-card-info">
                        <p className="task-type">{task.type}</p>
                        <p className="task-class">{task.class.subject} - Grade {task.class.gradeLevel}</p>
                        {task.groupNumber && (
                          <p className="task-group">Group {task.groupNumber}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Join Class Modal */}
        {showJoinModal && (
          <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Join Class</h2>
                <button className="modal-close" onClick={() => setShowJoinModal(false)}>×</button>
              </div>
              <form onSubmit={handleJoinSubmit}>
                <div className="modal-body">
                  <label htmlFor="classCode">Enter Class Code</label>
                  <input
                    type="text"
                    id="classCode"
                    value={classCode}
                    onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    required
                    autoFocus
                  />
                  {joinError && (
                    <div className="error-message">{joinError}</div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowJoinModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={joining}>
                    {joining ? 'Joining...' : 'Join Class'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Task View Modal */}
        {selectedTask && (
          <TaskViewModal
            task={selectedTask}
            onClose={handleCloseTaskView}
          />
        )}
      </div>
    );
  }

  // Educator or other roles - show basic dashboard
  return (
    <div className="dashboard">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1>Welcome, {user.username}!</h1>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <div className="dashboard-info">
          <div className="info-card">
            <h3>Role</h3>
            <p className="role-text">{role.charAt(0).toUpperCase() + role.slice(1)}</p>
          </div>
          <div className="info-card">
            <h3>Account Created</h3>
            <p>{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
