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
import BillingDashboard from './pages/BillingDashboard';
import Pay from './pages/Pay';
import Inbox from './pages/Inbox';
import AcceptInvite from './pages/AcceptInvite';
import WorkOrders from './pages/WorkOrders';
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
    return <Navigate to={user.role === 'field' ? '/work-orders' : '/dashboard'} />;
  }

  return children;
}

function DefaultRedirect() {
  const { user } = useAuth();
  if (user?.role === 'billing') return <Navigate to="/billing" replace />;
  if (user?.role === 'field')   return <Navigate to="/work-orders" replace />;
  return <Navigate to="/dashboard" replace />;
}

// Blocks field-role users from accessing any route except /work-orders
function NotField({ children }) {
  const { user } = useAuth();
  if (user?.role === 'field') return <Navigate to="/work-orders" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />

          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DefaultRedirect />} />
            <Route path="dashboard" element={<NotField><Dashboard /></NotField>} />
            <Route path="usage" element={<NotField><Usage /></NotField>} />
            <Route path="forecasts" element={<NotField><Forecasts /></NotField>} />
            <Route path="bills" element={<NotField><Bills /></NotField>} />
            <Route path="billing" element={<NotField><BillingDashboard /></NotField>} />
            <Route path="pay" element={<NotField><Pay /></NotField>} />
            <Route path="inbox" element={<NotField><Inbox /></NotField>} />
            <Route path="alerts" element={<NotField><PrivateRoute requiredRole="admin"><Alerts /></PrivateRoute></NotField>} />
            <Route path="admin" element={<NotField><PrivateRoute requiredRole="admin"><AdminDashboard /></PrivateRoute></NotField>} />
            <Route path="work-orders" element={<WorkOrders />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
