import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const WaterDropIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C12 2 4.5 10.8 4.5 15.5C4.5 19.64 7.86 23 12 23C16.14 23 19.5 19.64 19.5 15.5C19.5 10.8 12 2 12 2Z"
      fill="#1EA7D6"
    />
    <path
      d="M9 17C9 17 9 14.5 11.5 13"
      stroke="rgba(255,255,255,0.7)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(140deg, #0A4C78 0%, #083f60 55%, #062c44 100%)' }}
    >
      {/* Decorative glow blobs */}
      <div
        style={{
          position: 'absolute', top: '-8%', right: '-4%',
          width: '520px', height: '520px', borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(30, 167, 214, 0.22) 0%, transparent 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: '-12%', left: '-8%',
          width: '580px', height: '580px', borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(95, 181, 140, 0.14) 0%, transparent 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute', top: '40%', left: '20%',
          width: '300px', height: '300px', borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(30, 167, 214, 0.08) 0%, transparent 70%)',
        }}
      />

      {/* Card */}
      <div
        className="w-full relative z-10"
        style={{ maxWidth: '440px' }}
      >
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255, 255, 255, 0.97)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255,255,255,0.10)',
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2.5 mb-3">
              <WaterDropIcon />
              <h1
                className="text-3xl font-bold text-hydro-deep-aqua"
                style={{ letterSpacing: '-0.04em' }}
              >
                HydroSpark
              </h1>
            </div>
            <p className="text-sm text-gray-400 font-medium">
              Water Utility Management Platform
            </p>
          </div>

          {error && (
            <div
              className="px-4 py-3 rounded-xl mb-5 text-sm font-medium"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.22)',
                color: '#dc2626',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 mt-2"
              style={{ borderRadius: '12px', fontSize: '0.95rem' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/register" className="font-semibold text-hydro-spark-blue hover:underline">
                Register
              </Link>
            </p>
          </div>

          {/* Demo credentials */}
          <div
            className="mt-5 p-4 rounded-xl"
            style={{
              background: 'rgba(10, 76, 120, 0.05)',
              border: '1px solid rgba(10, 76, 120, 0.10)',
            }}
          >
            <p className="text-xs font-semibold text-hydro-deep-aqua uppercase tracking-wider mb-2">
              Demo Credentials
            </p>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">Admin:</span>{' '}
                admin@hydrospark.com / admin123
              </p>
              <p className="text-xs text-gray-400">
                Customer password: <span className="font-medium text-gray-600">welcome123</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
