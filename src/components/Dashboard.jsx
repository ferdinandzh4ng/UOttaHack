import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './Dashboard.css';

function Dashboard() {
  const { role } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }
    setUser(JSON.parse(userData));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  if (!user) {
    return (
      <div className="dashboard">
        <div className="dashboard-content">
          <div>Loading...</div>
        </div>
      </div>
    );
  }

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

