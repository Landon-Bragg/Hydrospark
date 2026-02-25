import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'billing';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-hydro-deep-aqua text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/dashboard" className="flex items-center">
                <h1 className="text-2xl font-bold">HydroSpark</h1>
              </Link>
              <div className="hidden md:flex ml-10 space-x-4 items-center">
                <Link to="/dashboard" className="px-3 py-2 rounded-md hover:bg-hydro-spark-blue transition">Dashboard</Link>
                <Link to="/usage" className="px-3 py-2 rounded-md hover:bg-hydro-spark-blue transition">Usage</Link>
                <Link to="/forecasts" className="px-3 py-2 rounded-md hover:bg-hydro-spark-blue transition">Forecasts</Link>
                <Link to="/bills" className="px-3 py-2 rounded-md hover:bg-hydro-spark-blue transition">Bills</Link>

{isAdmin && <Link to="/alerts" className="px-3 py-2 rounded-md hover:bg-hydro-spark-blue transition">Alerts</Link>}
{isAdmin && <Link to="/admin" className="px-3 py-2 rounded-md bg-hydro-green hover:bg-green-600 transition">Admin</Link>}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm">{user?.email}</span>
              <span className="text-xs bg-hydro-spark-blue px-2 py-1 rounded">{user?.role}</span>
              <button onClick={handleLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md transition">Logout</button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
