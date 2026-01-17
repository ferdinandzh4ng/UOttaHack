import { useNavigate } from 'react-router-dom';
import './Homepage.css';

function Homepage() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/role-selection');
  };

  return (
    <div className="homepage">
      <div className="homepage-content">
        <h1>Welcome to UOttaHack</h1>
        <p className="subtitle">Your learning platform</p>
        <button className="get-started-btn" onClick={handleGetStarted}>
          Get Started
        </button>
      </div>
    </div>
  );
}

export default Homepage;

