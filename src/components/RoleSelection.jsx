import { useNavigate } from 'react-router-dom';
import './RoleSelection.css';

function RoleSelection() {
  const navigate = useNavigate();

  const handleRoleSelect = (role) => {
    navigate(`/auth?role=${role}`);
  };

  return (
    <div className="role-selection">
      <div className="role-selection-content">
        <h1>Choose Your Role</h1>
        <p className="subtitle">Select how you want to use the platform</p>
        <div className="role-buttons">
          <button 
            className="role-btn educator-btn" 
            onClick={() => handleRoleSelect('educator')}
          >
            <div className="role-icon">👨‍🏫</div>
            <h2>Educator</h2>
            <p>Teach and manage courses</p>
          </button>
          <button 
            className="role-btn student-btn" 
            onClick={() => handleRoleSelect('student')}
          >
            <div className="role-icon">🎓</div>
            <h2>Student</h2>
            <p>Learn and take courses</p>
          </button>
        </div>
      </div>
    </div>
  );
}

export default RoleSelection;

