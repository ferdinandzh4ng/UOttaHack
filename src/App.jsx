import { Routes, Route } from 'react-router-dom';
import Homepage from './components/Homepage';
import RoleSelection from './components/RoleSelection';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import EducatorHomepage from './components/EducatorHomepage';
import ClassDetail from './components/ClassDetail';
import DeveloperAnalytics from './components/DeveloperAnalytics';
import './App.css';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/role-selection" element={<RoleSelection />} />
        <Route path="/auth" element={<AuthForm />} />
        <Route path="/educator/home" element={<EducatorHomepage />} />
        <Route path="/class/:classId" element={<ClassDetail />} />
        <Route path="/dashboard/:role" element={<Dashboard />} />
        <Route path="/analytics" element={<DeveloperAnalytics />} />
      </Routes>
    </div>
  );
}

export default App;

