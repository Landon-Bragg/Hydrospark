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
export const acceptInvite = (data) => api.post('/auth/accept-invite', data);
export const getWeatherForecast = (zip_code) => api.get('/weather/forecast', { params: { zip_code } });

// Usage
export const getUsage = (params) => api.get('/usage', { params });
export const getUsageSummary = (params) => api.get('/usage/summary', { params });
export const getTopCustomers = (params) => api.get('/usage/top-customers', { params });
export const getZipAverages = (params) => api.get('/usage/zip-averages', { params });

// Forecasts
export const generateForecast = (data) => api.post('/forecasts/generate', data);
export const generateSystemForecast = (data) => api.post('/forecasts/generate-system', data);
export const getForecasts = (params) => api.get('/forecasts', { params });

// Bills
export const getBills = (params) => api.get('/billing/bills', { params });
export const getBill = (id) => api.get(`/billing/bills/${id}`);
export const payBill = (id) => api.post(`/billing/bills/${id}/pay`);
export const getPaymentMethod = () => api.get('/billing/payment-method');
export const savePaymentMethod = (data) => api.post('/billing/payment-method', data);
export const deletePaymentMethod = () => api.delete('/billing/payment-method');
export const toggleAutopay = (enabled) => api.post('/billing/autopay', { enabled });
export const adminSearchBills = (params) => api.get('/billing/admin/bills', { params });
export const getBillingStats = () => api.get('/billing/stats');
export const generateBill = (data) => api.post('/billing/generate', data);
export const updateBill = (id, data) => api.put(`/billing/bills/${id}`, data);

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
export const getZipAnalytics = () => api.get('/admin/zip-analytics');
export const getAdminStats = () => api.get('/admin/stats');
export const approveUser = (id) => api.post(`/admin/users/${id}/approve`);
export const createUser = (data) => api.post('/admin/users', data);
export const getDelinquent = () => api.get('/admin/delinquent');
export const shutoffWater = (id, mode) => api.post(`/admin/customers/${id}/shutoff`, { mode });
export const restoreWater = (id) => api.post(`/admin/customers/${id}/restore`);
export const importData = (formData) => api.post('/admin/import/usage', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const detectAnomalies = () => api.post('/admin/detect', {});
export const generateHistoricalBills = () => api.post('/admin/generate-historical-bills', {});

// Chat
export const sendChat = (message, history) => api.post('/chat/message', { message, history });

// Support / Inbox
export const getSupportThreads = () => api.get('/support/threads');
export const getThreadMessages = (customerId) => api.get(`/support/threads/${customerId}/messages`);
export const sendToCustomer = (customerId, content) => api.post(`/support/threads/${customerId}/messages`, { content });
export const getMyMessages = () => api.get('/support/messages');
export const sendMyMessage = (content) => api.post('/support/messages', { content });
export const sendNotification = (data) => api.post('/support/notifications', data);
export const getNotifications = () => api.get('/support/notifications');
export const markNotificationRead = (id) => api.patch(`/support/notifications/${id}/read`);
export const getUnreadCount = () => api.get('/support/notifications/unread-count');

export default api;
