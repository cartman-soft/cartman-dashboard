/**
 * API Client & Network Service
 */

const API = {
  getToken() {
    return localStorage.getItem('cartman_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('cartman_token', token);
    } else {
      localStorage.removeItem('cartman_token');
    }
  },

  async request(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isAuthEndpoint = typeof endpoint === 'string' && endpoint.startsWith('/api/auth');
    if (!isAuthEndpoint && window.isDemoMode && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      this.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
      throw new Error('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.');
    }

    const url = endpoint.startsWith('http') ? endpoint : endpoint;
    const headers = options.headers || {};

    const token = this.getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Do not set Content-Type if body is FormData
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        this.setToken(null);
        if (window.AppState) {
          window.AppState.setUser(null);
        }
        if (window.CartmanInstance && typeof window.CartmanInstance.showLoginModal === 'function') {
          window.CartmanInstance.showLoginModal();
        }
        throw new Error('Authentication required. Please log in.');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(data.error || 'Requested service endpoint was not found (HTTP 404). Please ensure the backend server has been restarted with the latest routes.');
        }
        throw new Error(data.error || `HTTP error ${response.status}`);
      }
      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err.message);
      throw err;
    }
  },

  // Toast notifications
  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    el.innerHTML = `<span>${icon}</span><span style="flex:1;">${message}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all 0.3s';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  },

  // Currency Formatter
  formatInr(amount, showSymbol = true) {
    if (amount === null || amount === undefined) return '—';
    const num = Number(amount);
    if (isNaN(num)) return '—';
    const formatted = num.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
    return showSymbol ? `₹${formatted}` : formatted;
  },

  // Auth
  auth: {
    requestOtp: (email) => API.request('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
    verifyOtp: (email, otp, challengeToken) => API.request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp, challengeToken })
    }),
    login: (username, password) => API.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
    logout: () => API.request('/api/auth/logout', { method: 'POST' }).catch(() => ({})),
    me: () => API.request('/api/auth/me')
  },

  // Dashboard
  dashboard: {
    getOverview: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return API.request(`/api/dashboard/overview?${q}`);
    },
    getTrends: (days = 14, includeDemo = true) => {
      return API.request(`/api/dashboard/trends?days=${days}&includeDemo=${includeDemo}`);
    }
  },

  // Accounts
  accounts: {
    getAll: () => API.request('/api/accounts'),
    create: (data) => API.request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => API.request(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    sync: (id) => API.request(`/api/accounts/${id}/sync`, { method: 'POST' })
  },

  // Orders
  orders: {
    getSummary: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return API.request(`/api/orders/summary?${q}`);
    }
  },

  // Reconciliation
  reconciliation: {
    getSummary: () => API.request('/api/reconciliation/summary'),
    run: () => API.request('/api/reconciliation/run', { method: 'POST' }),
    match: (bankTransactionId, settlementId, note) => API.request('/api/reconciliation/match', {
      method: 'POST',
      body: JSON.stringify({ bankTransactionId, settlementId, note })
    }),
    unmatch: (bankTransactionId) => API.request('/api/reconciliation/unmatch', {
      method: 'POST',
      body: JSON.stringify({ bankTransactionId })
    })
  },

  // Bank
  bank: {
    getProfiles: () => API.request('/api/bank/profiles'),
    previewStatement: (formData) => API.request('/api/bank/preview', { method: 'POST', body: formData }),
    importStatement: (formData) => API.request('/api/bank/import', { method: 'POST', body: formData }),
    getStatements: () => API.request('/api/bank/statements')
  },

  // Reports
  reports: {
    getExcelUrl: (params = {}) => `/api/reports/excel?${new URLSearchParams(params).toString()}`,
    getCsvUrl: (params = {}) => `/api/reports/csv?${new URLSearchParams(params).toString()}`,
    getPrintUrl: (params = {}) => `/api/reports/print?${new URLSearchParams(params).toString()}`
  },

  // Users
  users: {
    getAll: () => API.request('/api/users'),
    create: (data) => API.request('/api/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => API.request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    getRoles: () => API.request('/api/users/roles')
  },

  // Integrations
  integrations: {
    getSpecs: () => API.request('/api/integrations/specs'),
    uploadReport: (formData) => API.request('/api/integrations/report-upload', { method: 'POST', body: formData }),
    getSyncLogs: () => API.request('/api/integrations/sync-logs'),
    syncAll: () => API.request('/api/integrations/sync-all', { method: 'POST' }),
    getAuditLogs: () => API.request('/api/integrations/audit-logs')
  },

  // Sales Report Upload & Identification
  salesReport: {
    getAccounts: (marketplace) => {
      const q = marketplace ? `?marketplace=${encodeURIComponent(marketplace)}` : '';
      return API.request(`/api/sales-report/accounts${q}`);
    },
    preview: (formData) => API.request('/api/sales-report/preview', { method: 'POST', body: formData }),
    import: (formData) => API.request('/api/sales-report/import', { method: 'POST', body: formData })
  }
};
