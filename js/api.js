/**
 * Smart Subscription Manager - API Client Module
 */
const API_BASE_URL = (typeof window !== 'undefined' && (window.location.port === '8080' || window.location.port === '3000'))
  ? '/api'
  : 'http://localhost:8080/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('smartsub_token') || null;
    this.user = JSON.parse(localStorage.getItem('smartsub_user') || 'null');
  }

async getValidToken() {
  if (typeof window !== 'undefined' && window.firebaseAuth &&
      typeof window.firebaseAuth.getIdToken === 'function') {
    try {
      const freshToken = await window.firebaseAuth.getIdToken();
      if (freshToken) {
        this.token = freshToken;
        localStorage.setItem('smartsub_token', freshToken);
        return freshToken;
      }
    } catch (err) {
      console.warn('Could not refresh Firebase ID token:', err);
    }
  }
  return this.token;
}

  getHeaders(isMultipart = false) {
    const headers = {};
    if (!isMultipart) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const isMultipart = options.body instanceof FormData;
    const token = await this.getValidToken();

    const headers = {};
    if (!isMultipart) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      if (response.status === 401) {
  const isLoginEndpoint = [
    '/auth/login',
    '/auth/demo',
    '/auth/register',
    '/auth/firebase-login'
  ].includes(endpoint);

  if (isLoginEndpoint) {
    let message = 'Login failed. Please check your credentials.';
    try {
      const errorData = await response.json();
      message = errorData.message || message;
    } catch (e) {}

    throw new Error(message);
  }

  this.clearAuth();
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  throw new Error('Session expired or unauthorized. Please log in again.');
}

      if (!response.ok) {
        let errMsg = `Request failed: ${response.status} ${response.statusText}`;
        try {
          const errData = await response.json();
          errMsg = errData.message || errMsg;
        } catch (e) {}
        throw new Error(errMsg);
      }

      // Handle 204 No Content or empty bodies
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  }

  // --- Auth APIs ---
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setAuth(data.token, data);
    return data;
  }

  async register(username, email, password, fullName, monthlyBudget) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, fullName, monthlyBudget })
    });
    this.setAuth(data.token, data);
    return data;
  }

  async firebaseLogin(idToken) {
    const data = await this.request('/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify({ idToken })
    });
    this.setAuth(idToken, data);
    return data;
  }

  async loginDemo() {
    const data = await this.request('/auth/demo', {
      method: 'POST'
    });
    this.setAuth(data.token, data);
    return data;
  }

  setAuth(token, userData) {
    this.token = token;
    this.user = userData;
    localStorage.setItem('smartsub_token', token);
    localStorage.setItem('smartsub_user', JSON.stringify(userData));
    window.dispatchEvent(new CustomEvent('auth:login', { detail: userData }));
  }

  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('smartsub_token');
    localStorage.removeItem('smartsub_user');
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  isAuthenticated() {
    return !!this.token;
  }

  async getProfile() {
    return this.request('/auth/profile');
  }

  async updateBudget(monthlyBudget) {
    return this.request('/auth/budget', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudget })
    });
  }

  // --- Subscription APIs ---
  async getSubscriptions(activeOnly = false) {
    return this.request(`/subscriptions${activeOnly ? '?activeOnly=true' : ''}`);
  }

  async getSubscriptionById(id) {
    return this.request(`/subscriptions/${id}`);
  }

  async createSubscription(subData) {
    return this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subData)
    });
  }

  async updateSubscription(id, subData) {
    return this.request(`/subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(subData)
    });
  }

  async recordPriceChange(id, newPrice, reason, effectiveDate) {
    return this.request(`/subscriptions/${id}/price`, {
      method: 'PATCH',
      body: JSON.stringify({ newPrice, reason, effectiveDate })
    });
  }

  async toggleStatus(id, status) {
    return this.request(`/subscriptions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async deleteSubscription(id) {
    return this.request(`/subscriptions/${id}`, {
      method: 'DELETE'
    });
  }

  // --- Analytics & Intelligence APIs ---
  async getDashboardSummary() {
    return this.request('/analytics/dashboard');
  }

  async getHealthScores() {
    return this.request('/analytics/health-scores');
  }

  async getCostPerUse() {
    return this.request('/analytics/cost-per-use');
  }

  async getOverlaps() {
    return this.request('/analytics/overlaps');
  }

  async getFutureForecast() {
    return this.request('/analytics/future-forecast');
  }

  async getRenewalRisks() {
    return this.request('/analytics/renewal-risks');
  }

  async getCalendar(filter = 'all') {
    return this.request(`/analytics/calendar?filter=${filter}`);
  }

  async simulateSavings(candidateCancelIds = []) {
    return this.request('/analytics/simulate-savings', {
      method: 'POST',
      body: JSON.stringify({ candidateCancelIds })
    });
  }

  // --- AI Advisor APIs ---
  async askAiAdvisor(query) {
    return this.request('/ai/advisor', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  }

  // --- Goals APIs ---
  async getGoals() {
    return this.request('/goals');
  }

  async createGoal(goalData) {
    return this.request('/goals', {
      method: 'POST',
      body: JSON.stringify(goalData)
    });
  }

  async updateGoalProgress(goalId, progressPercentage) {
    return this.request(`/goals/${goalId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ progressPercentage })
    });
  }

  async deleteGoal(goalId) {
    return this.request(`/goals/${goalId}`, {
      method: 'DELETE'
    });
  }

  // --- Shared Subscription APIs ---
  async getSharedMembers(subscriptionId) {
    return this.request(`/shared/subscription/${subscriptionId}`);
  }

  async addSharedMember(memberData) {
    return this.request('/shared/members', {
      method: 'POST',
      body: JSON.stringify(memberData)
    });
  }

  async toggleSharedMemberPaid(memberId, isPaid) {
    return this.request(`/shared/members/${memberId}/paid`, {
      method: 'PATCH',
      body: JSON.stringify({ isPaid })
    });
  }

  async removeSharedMember(memberId) {
    return this.request(`/shared/members/${memberId}`, {
      method: 'DELETE'
    });
  }

  // --- Timeline APIs ---
  async getTimeline() {
    return this.request('/timeline');
  }

  // --- Import APIs ---
  async uploadCsv(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/import/csv', {
      method: 'POST',
      body: formData
    });
  }

  async uploadReceipt(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/import/receipt', {
      method: 'POST',
      body: formData
    });
  }
}

const api = new ApiService();
window.api = api;
