import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateClassModal from './CreateClassModal';
import './EducatorHomepage.css';

function EducatorHomepage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedClass, setDraggedClass] = useState(null);
  const [trashHover, setTrashHover] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }
    const userObj = JSON.parse(userData);
    setUser(userObj);
    
    // Fetch educator's classes
    fetchClasses(userObj.id);
  }, [navigate]);

  const fetchClasses = async (educatorId) => {
    try {
      const response = await fetch(`/api/classes/educator/${educatorId}`);
      const data = await response.json();
      if (response.ok) {
        setClasses(data.classes || []);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const handleCreateClass = () => {
    setShowCreateModal(true);
  };

  const handleClassCreated = async () => {
    // Refresh the classes list
    if (user) {
      await fetchClasses(user.id);
    }
    setShowCreateModal(false);
  };

  const handleDragStart = (e, classId) => {
    setDraggedClass(classId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedClass(null);
    setTrashHover(false);
  };

  const handleTrashDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setTrashHover(true);
  };

  const handleTrashDragLeave = () => {
    setTrashHover(false);
  };

  const handleTrashDrop = async (e) => {
    e.preventDefault();
    setTrashHover(false);
    
    if (draggedClass) {
      if (window.confirm('Are you sure you want to delete this class?')) {
        await deleteClass(draggedClass);
      }
    }
    setDraggedClass(null);
  };

  const deleteClass = async (classId) => {
    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Refresh classes list
        if (user) {
          await fetchClasses(user.id);
        }
      } else {
        console.error('Error deleting class:', response.statusText);
      }
    } catch (error) {
      console.error('Error deleting class:', error);
    }
  };

  if (!user || loading) {
    return (
      <div className="educator-homepage">
        <div className="educator-content">
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="educator-homepage">
      <div className="educator-content">
        <div className="educator-header">
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

        <div className="educator-actions">
          <button className="create-class-btn" onClick={handleCreateClass}>
            + Create Class
          </button>
        </div>

        <div className="classes-section">
          <div className="classes-header">
            <h2>My Classes</h2>
          </div>
          {classes.length === 0 ? (
            <div className="no-classes">
              <p>No classes yet. Create your first class to get started!</p>
            </div>
          ) : (
            <div className="classes-grid">
              {classes.map((classItem) => (
                <div 
                  key={classItem.id || classItem._id} 
                  className="class-card"
                  onClick={() => navigate(`/class/${classItem.id || classItem._id}`)}
                >
                  <div className="class-card-top">
                    <div>
                      <h3>{classItem.subject}</h3>
                      <p className="grade-level">Grade {classItem.gradeLevel}</p>
                      <p className="created-date">
                        Created {new Date(classItem.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      className="class-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Are you sure you want to delete this class?')) {
                          deleteClass(classItem.id || classItem._id);
                        }
                      }}
                      title="Delete class"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateClassModal
          educatorId={user.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleClassCreated}
        />
      )}
    </div>
  );
}

export default EducatorHomepage;

