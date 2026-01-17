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
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="educator-actions">
          <button className="create-class-btn" onClick={handleCreateClass}>
            + Create Class
          </button>
        </div>

        <div className="classes-section">
          <h2>My Classes</h2>
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
                  <h3>{classItem.subject}</h3>
                  <p className="grade-level">Grade {classItem.gradeLevel}</p>
                  <p className="created-date">
                    Created {new Date(classItem.createdAt).toLocaleDateString()}
                  </p>
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

