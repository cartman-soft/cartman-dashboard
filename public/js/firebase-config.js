/**
 * Cartman Firebase Configuration Resolver
 * Reads Firebase project configuration from project environment or saved user settings.
 * Does NOT invent dummy credentials.
 */

window.CartmanFirebaseConfig = {
  // Check if configuration object has required keys
  isValid(config) {
    return Boolean(
      config &&
      typeof config.apiKey === 'string' && config.apiKey.trim() !== '' &&
      typeof config.projectId === 'string' && config.projectId.trim() !== ''
    );
  },

  // Resolve config from window global, localStorage, or server endpoint
  async resolve() {
    if (window.isDemoMode) {
      return null;
    }
    // 1. Check window-injected configuration
    if (window.__FIREBASE_CONFIG__ && this.isValid(window.__FIREBASE_CONFIG__)) {
      return window.__FIREBASE_CONFIG__;
    }

    // 2. Check localStorage
    try {
      const raw = localStorage.getItem('cartman_firebase_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (this.isValid(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[FirebaseConfig] Could not parse localStorage config:', e);
    }

    // 3. Check server-provided config endpoint (populated from .env)
    try {
      const res = await fetch('/api/firebase/config');
      if (res.ok) {
        const body = await res.json();
        if (body.data && body.data.isConfigured && this.isValid(body.data)) {
          return body.data;
        }
      }
    } catch (e) {
      // Server offline or unavailable
    }

    return null;
  }
};
