import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Usage from './pages/Usage';
import Forecasts from './pages/Forecasts';
import Bills from './pages/Bills';
import Alerts from './pages/Alerts';
import AdminDashboard from './pages/AdminDashboard';
import Layout from './components/Layout';

function PrivateRoute({ children, requiredRole }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-xl">Loading...</div>
    </div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (requiredRole && user.role !== requiredRole && !['admin', 'billing'].includes(user.role)) {
    return <Navigate to="/dashboard" />;
  }
  
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="usage" element={<Usage />} />
            <Route path="forecasts" element={<Forecasts />} />
            <Route path="bills" element={<Bills />} />
            <Route path="alerts" element={<PrivateRoute requiredRole="admin"><Alerts /></PrivateRoute>} />
<Route path="admin" element={<PrivateRoute requiredRole="admin"><AdminDashboard /></PrivateRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
