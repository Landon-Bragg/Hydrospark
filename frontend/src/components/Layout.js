import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ChatBot from './ChatBot';

const WaterDropIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C12 2 4.5 10.8 4.5 15.5C4.5 19.64 7.86 23 12 23C16.14 23 19.5 19.64 19.5 15.5C19.5 10.8 12 2 12 2Z"
      fill="rgba(255,255,255,0.92)"
    />
    <path
      d="M9 17C9 17 9 14.5 11.5 13"
      stroke="rgba(30,167,214,0.65)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/usage',     label: 'Usage' },
  { to: '/forecasts', label: 'Forecasts' },
  { to: '/bills',     label: 'Bills' },
];

const ADMIN_LINKS = [
  { to: '/alerts', label: 'Alerts' },
  { to: '/admin',  label: 'Admin', accent: true },
];

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'billing';
  const links = [...NAV_LINKS, ...(isAdmin ? ADMIN_LINKS : [])];

  return (
    <div className="min-h-screen">
      <nav
        style={{
          background: 'linear-gradient(135deg, #0A4C78 0%, #073f64 100%)',
          borderBottom: '1px solid rgba(30, 167, 214, 0.22)',
          boxShadow: '0 1px 24px rgba(10, 76, 120, 0.40), 0 0 0 0.5px rgba(30, 167, 214, 0.12)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Left: Logo + Nav links */}
            <div className="flex items-center gap-7">
              <Link to="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
                <WaterDropIcon />
                <span className="text-white font-bold text-xl" style={{ letterSpacing: '-0.03em' }}>
                  HydroSpark
                </span>
              </Link>

              <div className="hidden md:flex items-center gap-0.5">
                {links.map(({ to, label, accent }) => {
                  const isActive = location.pathname === to;
                  if (accent) {
                    return (
                      <Link
                        key={to}
                        to={to}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150"
                        style={{
                          background: isActive ? 'rgba(95, 181, 140, 0.95)' : 'rgba(95, 181, 140, 0.75)',
                          color: '#ffffff',
                          boxShadow: isActive ? '0 0 14px rgba(95, 181, 140, 0.42)' : 'none',
                        }}
                      >
                        {label}
                      </Link>
                    );
                  }
                  return (
                    <Link
                      key={to}
                      to={to}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
                      style={{
                        background: isActive ? 'rgba(255,255,255,0.14)' : 'transparent',
                        color: isActive ? '#ffffff' : 'rgba(255,255,255,0.62)',
                        boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.12)' : 'none',
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
                          e.currentTarget.style.color = '#ffffff';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'rgba(255,255,255,0.62)';
                        }
                      }}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right: User info + Sign out */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2.5">
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.52)' }}>
                  {user?.email}
                </span>
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(30, 167, 214, 0.20)',
                    color: '#7dd8f0',
                    border: '1px solid rgba(30, 167, 214, 0.28)',
                  }}
                >
                  {user?.role}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-150"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.70)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.18)';
                  e.currentTarget.style.color = '#fca5a5';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.28)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.70)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                }}
              >
                Sign out
              </button>
            </div>

          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 hydro-page">
        <Outlet />
      </main>

      <ChatBot />
    </div>
  );
}

export default Layout;
