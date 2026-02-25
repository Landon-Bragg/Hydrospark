import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (data) => api.post('/auth/register', data);
export const getCurrentUser = () => api.get('/auth/me');

// Usage
export const getUsage = (params) => api.get('/usage', { params });
export const getUsageSummary = (params) => api.get('/usage/summary', { params });

// Forecasts
export const generateForecast = (data) => api.post('/forecasts/generate', data);
export const getForecasts = (params) => api.get('/forecasts', { params });

// Bills
export const getBills = (params) => api.get('/billing/bills', { params });
export const getBill = (id) => api.get(`/billing/bills/${id}`);

// Alerts
export const getAlerts = (params) => api.get('/alerts', { params });
export const acknowledgeAlert = (id) => api.post(`/alerts/${id}/acknowledge`);

// Admin
export const getUsers = () => api.get('/admin/users');
export const getAdminCharges = () => api.get('/admin/charges');
export const setCustomerRate = (customerId, data) => api.put(`/admin/customers/${customerId}/rate`, data);
export const getZipRates = () => api.get('/admin/zip-rates');
export const createZipRate = (data) => api.post('/admin/zip-rates', data);
export const updateZipRate = (id, data) => api.put(`/admin/zip-rates/${id}`, data);
export const deleteZipRate = (id) => api.delete(`/admin/zip-rates/${id}`);
export const approveUser = (id) => api.post(`/admin/users/${id}/approve`);
export const createUser = (data) => api.post('/admin/users', data);
export const importData = (formData) => api.post('/admin/import/usage', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});

export default api;
