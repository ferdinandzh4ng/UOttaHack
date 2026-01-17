import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './Dashboard.css';

function Dashboard() {
  const { role } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }
    const userObj = JSON.parse(userData);
    setUser(userObj);

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

  const handleTaskClick = (task) => {
    navigate(`/class/${task.class.id}`);
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
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>

          {/* Classes Section */}
          <div className="dashboard-section">
            <h2>My Classes</h2>
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

          {/* Tasks Section */}
          <div className="dashboard-section">
            <h2>My Tasks</h2>
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

