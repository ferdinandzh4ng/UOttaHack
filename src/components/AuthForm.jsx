import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './AuthForm.css';

function AuthForm() {
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role');
  const mode = searchParams.get('mode') || 'login';
  const navigate = useNavigate();
  
  const [isLogin, setIsLogin] = useState(mode === 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Validate role for signup
  useEffect(() => {
    if (!isLogin) {
      // For signup, require role selection
      if (!role) {
        navigate('/role-selection');
        return;
      }
      
      // Validate role is only educator or student
      if (role !== 'educator' && role !== 'student') {
        setError('Invalid role. Please select Educator or Student.');
        navigate('/role-selection');
        return;
      }
    }
  }, [isLogin, role, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/users/login' : '/api/users/signup';
      
      // For signup, ensure role is educator, student, or developer
      if (!isLogin) {
        if (!role || (role !== 'educator' && role !== 'student' && role !== 'developer')) {
          throw new Error('Please select a valid role (Educator, Student, or Developer)');
        }
      }
      
      const body = isLogin 
        ? { username, password }
        : { username, password, role };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Success - store user info and redirect
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.user.role === 'educator') {
        navigate('/educator/home');
      } else if (data.user.role === 'developer') {
        navigate('/analytics');
      } else {
        navigate('/dashboard/student');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <div className="auth-form-content">
        <button className="back-btn" onClick={() => {
          if (isLogin) {
            navigate('/');
          } else {
            navigate('/role-selection');
          }
        }}>
          ← Back
        </button>
        <div className="auth-form-header">
          <h1>{isLogin ? 'Login' : 'Sign Up'}</h1>
          {!isLogin && role && (
            <p className="role-badge">As {role.charAt(0).toUpperCase() + role.slice(1)}</p>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Enter your username"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              minLength={6}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>

        <p className="toggle-auth">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button 
            type="button" 
            className="link-btn" 
            onClick={() => {
              if (isLogin) {
                // Switching from login to signup - go to role selection
                navigate('/role-selection');
              } else {
                // Switching from signup to login - go to login page
                setIsLogin(true);
                setError('');
                navigate('/auth?mode=login');
              }
            }}
          >
            {isLogin ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthForm;

