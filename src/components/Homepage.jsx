import { useNavigate } from 'react-router-dom';
import './Homepage.css';

function Homepage() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/role-selection');
  };

  const handleLogin = () => {
    navigate('/auth?mode=login');
  };

  const handleJoinNow = () => {
    navigate('/role-selection');
  };

  // AI Model logos with actual image paths
  const aiModels = [
    { name: 'GPT-4', logo: '/OpenAi.webp' },
    { name: 'Claude', logo: '/Claude.png' },
    { name: 'Gemini', logo: '/Gemini.webp' },
    { name: 'Llama', logo: '/Llamma.webp' },
    { name: 'Mistral', logo: '/Mistral.jpg' },
    { name: 'PaLM', logo: '/paLM.png' },
    { name: 'deepseek', logo: '/deepseek.png' },
  ];

  return (
    <div className="homepage">
      {/* Header */}
      <header className="homepage-header">
        <div className="header-logo">
          <div className="logo-icon">Y2L</div>
          <span className="logo-text">Yours2Learn</span>
        </div>
        <nav className="header-nav">
          <button className="nav-link" onClick={handleLogin}>Log In</button>
          <button className="nav-button" onClick={handleJoinNow}>Join Now</button>
        </nav>
      </header>

      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">
          <div className="hero-left">
            <h1 className="hero-headline">
              Unlock Top AI Learning Resources Made Just For You – Now Just One Click Away!
            </h1>
            <button className="get-started-btn" onClick={handleGetStarted}>
              Get Started &gt;
            </button>
          </div>
          <div className="hero-right">
            <div className="orbital-network">
              <div className="network-center">
                <div className="center-number">20k+</div>
                <div className="center-label">AI Models</div>
              </div>
              {[0, 1, 2, 3, 4, 5, 6].map((ring) => (
                <div key={ring} className={`orbit-ring ring-${ring}`}></div>
              ))}
              {aiModels.map((model, index) => (
                <div key={index} className="orbital-item">
                  <div className="model-logo">
                    <img 
                      src={model.logo} 
                      alt={model.name}
                      className="model-icon"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Homepage;

