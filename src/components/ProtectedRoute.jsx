import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children, requiredRole }) {
  const userStr = localStorage.getItem('user');
  
  if (!userStr) {
    return <Navigate to="/auth?mode=login" replace />;
  }

  try {
    const user = JSON.parse(userStr);
    
    if (requiredRole && user.role !== requiredRole) {
      // Redirect based on user's actual role
      if (user.role === 'educator') {
        return <Navigate to="/educator/home" replace />;
      } else if (user.role === 'student') {
        return <Navigate to="/dashboard/student" replace />;
      } else {
        return <Navigate to="/" replace />;
      }
    }

    return children;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return <Navigate to="/auth?mode=login" replace />;
  }
}

