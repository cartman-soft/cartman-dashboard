/**
 * Reactive Application State Manager
 */

class StateManager {
  constructor() {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    this.state = {
      user: null,
      activeView: 'dashboard',
      includeDemo: localStorage.getItem('cartman_include_demo') !== 'false',
      dateFilter: {
        period: 'monthly',
        date: today,
        month: currentMonth,
        startDate: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        endDate: today
      },
      overviewData: null,
      accounts: [],
      reconSummary: null,
      specs: null
    };

    this.listeners = new Map();
  }

  get(key) {
    return this.state[key];
  }

  set(key, val) {
    this.state[key] = val;
    this.emit(key, val);
  }

  setUser(user) {
    this.state.user = user;
    this.emit('user', user);
  }

  setActiveView(view) {
    this.state.activeView = view;
    this.emit('activeView', view);
  }

  setIncludeDemo(include) {
    this.state.includeDemo = include;
    localStorage.setItem('cartman_include_demo', include ? 'true' : 'false');
    this.emit('includeDemo', include);
    this.emit('filterChange', this.getFilterParams());
  }

  setDateFilter(updates) {
    this.state.dateFilter = { ...this.state.dateFilter, ...updates };
    this.emit('dateFilter', this.state.dateFilter);
    this.emit('filterChange', this.getFilterParams());
  }

  getFilterParams() {
    const df = this.state.dateFilter;
    const params = {
      period: df.period,
      includeDemo: this.state.includeDemo ? 'true' : 'false'
    };

    if (df.period === 'daily') {
      params.date = df.date;
    } else if (df.period === 'monthly') {
      params.month = df.month;
    } else if (df.period === 'custom') {
      params.startDate = df.startDate;
      params.endDate = df.endDate;
    }
    return params;
  }

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => {
      const arr = this.listeners.get(event) || [];
      this.listeners.set(event, arr.filter(cb => cb !== callback));
    };
  }

  emit(event, payload) {
    const arr = this.listeners.get(event) || [];
    arr.forEach(cb => {
      try {
        cb(payload);
      } catch (e) {
        console.error(`[State Error] in listener for '${event}':`, e);
      }
    });
  }
}

window.AppState = new StateManager();
