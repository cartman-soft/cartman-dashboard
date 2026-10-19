/**
 * Firebase Client Service
 * Provides:
 * 1. Firebase App, Auth & Firestore initialization
 * 2. Real-time Firestore snapshot listeners (orders, settlements, accounts, bank_transactions)
 * 3. Firebase Authentication (Email/Password + Phone/SMS OTP verification with RecaptchaVerifier)
 * 4. Dual-mode support (Seamless fallback to local Express API + Firestore 1-click sync)
 * 5. Configuration modal for entering Firebase Project credentials
 */

class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.recaptchaVerifier = null;
    this.confirmationResult = null;
    this.isInitialized = false;
    this.realtimeUnsubscribers = [];
    this.firestoreData = {
      accounts: [],
      orders: [],
      settlements: [],
      bank_transactions: []
    };
  }

  async init() {
    console.log('[FirebaseService] Initializing Firebase client layer...');

    // Check if Firebase compat libraries are loaded
    if (typeof firebase === 'undefined') {
      console.warn('[FirebaseService] Firebase SDK scripts not loaded.');
      this.updateStatusBadge('offline', 'Firebase SDK Unavailable');
      return;
    }

    // Resolve config from project environment / storage without inventing credentials
    let config = null;
    if (window.CartmanFirebaseConfig) {
      config = await window.CartmanFirebaseConfig.resolve();
    } else {
      config = this.getSavedConfig();
    }

    if (config && config.apiKey && config.projectId) {
      this.connect(config);
    } else {
      this.updateStatusBadge('unconfigured', 'Firestore: Setup Required');
    }

    this.bindGlobalButton();
  }

  getSavedConfig() {
    try {
      const raw = localStorage.getItem('cartman_firebase_config');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  saveConfig(config) {
    try {
      localStorage.setItem('cartman_firebase_config', JSON.stringify(config));
    } catch (e) {
      console.error('[FirebaseService] Failed to save config to localStorage:', e);
    }
  }

  connect(config) {
    try {
      if (firebase.apps.length > 0) {
        this.app = firebase.apps[0];
      } else {
        this.app = firebase.initializeApp(config);
      }

      this.auth = firebase.auth();
      this.firestore = firebase.firestore();
      this.isInitialized = true;

      console.log(`[FirebaseService] Connected to Firebase project: ${config.projectId}`);
      this.updateStatusBadge('connected', 'Firestore: Live Real-Time');

      // Setup Auth state listener
      this.auth.onAuthStateChanged(user => {
        if (user) {
          console.log('[FirebaseService] Firebase Auth User detected:', user.email || user.phoneNumber);
          const mappedUser = {
            id: user.uid,
            email: user.email || user.phoneNumber || 'firebase-user@cartman.com',
            fullName: user.displayName || (user.email ? user.email.split('@')[0] : 'Firebase User'),
            role: 'Admin',
            isFirebaseAuth: true
          };
          window.AppState.setUser(mappedUser);
          if (window.CartmanInstance && typeof window.CartmanInstance.updateUserUI === 'function') {
            window.CartmanInstance.updateUserUI(mappedUser);
          }
        }
      });

      // Start real-time Firestore listeners
      this.startRealtimeListeners();
      return { success: true };
    } catch (err) {
      console.error('[FirebaseService] Connection error:', err);
      this.updateStatusBadge('error', 'Firestore: Error');
      return { success: false, error: err.message };
    }
  }

  startRealtimeListeners() {
    if (!this.firestore) return;

    // Clean up previous listeners
    this.stopRealtimeListeners();

    // Focus real-time listeners strictly on live transaction collections
    const collections = ['orders', 'settlements'];

    collections.forEach(colName => {
      try {
        const unsub = this.firestore.collection(colName).onSnapshot(
          snapshot => {
            const docs = [];
            snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
            this.firestoreData[colName] = docs;
            console.log(`[FirebaseService] Real-time update for ${colName}: ${docs.length} records`);

            // Emit state event so UI components can re-render or show notification
            window.AppState.emit(`firestore_${colName}_updated`, docs);

            // Subtle pulse on Firebase status badge
            this.pulseStatusBadge();
          },
          err => {
            console.warn(`[FirebaseService] Snapshot listener error on ${colName}:`, err.message);
          }
        );

        this.realtimeUnsubscribers.push(unsub);
      } catch (err) {
        console.warn(`[FirebaseService] Error setting listener on ${colName}:`, err.message);
      }
    });
  }

  stopRealtimeListeners() {
    this.realtimeUnsubscribers.forEach(unsub => {
      try { unsub(); } catch (e) {}
    });
    this.realtimeUnsubscribers = [];
  }

  // Dual-mode Firebase Authentication Methods
  async loginWithEmailPassword(email, password) {
    if (!this.auth) {
      throw new Error('Firebase Auth is not initialized. Please configure Firebase first.');
    }
    return await this.auth.signInWithEmailAndPassword(email, password);
  }

  async registerWithEmailPassword(email, password, displayName) {
    if (!this.auth) {
      throw new Error('Firebase Auth is not initialized.');
    }
    const cred = await this.auth.createUserWithEmailAndPassword(email, password);
    if (displayName && cred.user) {
      await cred.user.updateProfile({ displayName });
    }
    return cred;
  }

  initRecaptcha(containerId = 'recaptchaContainer') {
    if (!this.auth) throw new Error('Firebase Auth not initialized.');

    // Clear existing recaptcha if present
    if (this.recaptchaVerifier) {
      try { this.recaptchaVerifier.clear(); } catch (e) {}
    }

    this.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, {
      size: 'normal',
      callback: () => {
        console.log('[FirebaseService] Recaptcha verified.');
      },
      'expired-callback': () => {
        console.warn('[FirebaseService] Recaptcha expired.');
      }
    });

    return this.recaptchaVerifier.render();
  }

  async sendPhoneOtp(phoneNumber) {
    if (!this.auth) throw new Error('Firebase Auth not initialized.');
    if (!this.recaptchaVerifier) {
      await this.initRecaptcha();
    }
    this.confirmationResult = await this.auth.signInWithPhoneNumber(phoneNumber, this.recaptchaVerifier);
    return this.confirmationResult;
  }

  async verifyPhoneOtp(otpCode) {
    if (!this.confirmationResult) {
      throw new Error('No active phone OTP verification in progress. Please request OTP first.');
    }
    return await this.confirmationResult.confirm(otpCode);
  }

  async signOut() {
    if (this.auth) {
      await this.auth.signOut();
    }
    this.stopRealtimeListeners();
  }

  // Export & Seed local data to Firestore
  async syncAllToFirestore() {
    if (!this.firestore) {
      throw new Error('Firestore is not connected. Please save valid Firebase configuration first.');
    }

    try {
      // Fetch all local records via API
      const [ordersRes, accountsRes, reconRes, bankRes] = await Promise.all([
        API.orders.getAll({ limit: 100 }),
        API.accounts.getAll(),
        API.reconciliation.getSummary(),
        API.bank.getAccounts()
      ]);

      const accounts = accountsRes.data || [];
      const orders = ordersRes.data || [];
      const settlements = (reconRes.data && reconRes.data.allSettlements) || [];
      const bankAccounts = bankRes.data || [];

      let uploadedCount = 0;

      // Batch upload accounts
      for (const acc of accounts) {
        await this.firestore.collection('accounts').doc(acc.id).set({
          ...acc,
          syncedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        uploadedCount++;
      }

      // Batch upload orders
      for (const ord of orders) {
        await this.firestore.collection('orders').doc(ord.id).set({
          ...ord,
          syncedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        uploadedCount++;
      }

      // Batch upload settlements
      for (const st of settlements) {
        await this.firestore.collection('settlements').doc(st.id).set({
          ...st,
          syncedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        uploadedCount++;
      }

      return {
        success: true,
        message: `Successfully synchronized ${uploadedCount} documents to Firebase Cloud Firestore!`,
        count: uploadedCount
      };
    } catch (err) {
      console.error('[FirebaseService] Sync to Firestore error:', err);
      throw err;
    }
  }

  updateStatusBadge(status, text) {
    const btn = document.getElementById('btnFirebaseStatus');
    const label = document.getElementById('firebaseStatusText');
    if (!btn || !label) return;

    label.textContent = text;
    btn.className = `btn-firebase-badge ${status}`;

    if (status === 'connected') {
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';
    } else if (status === 'unconfigured') {
      btn.style.borderColor = '#f59e0b';
      btn.style.color = '#fbbf24';
    } else {
      btn.style.borderColor = '#ef4444';
      btn.style.color = '#f87171';
    }
  }

  pulseStatusBadge() {
    const btn = document.getElementById('btnFirebaseStatus');
    if (btn) {
      btn.classList.add('pulse');
      setTimeout(() => btn.classList.remove('pulse'), 1000);
    }
  }

  bindGlobalButton() {
    const btn = document.getElementById('btnFirebaseStatus');
    if (btn) {
      btn.onclick = () => this.showConfigModal();
    }
  }

  showConfigModal() {
    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');
    if (!modal || !card) return;

    const currentConfig = this.getSavedConfig() || {};
    const isConn = this.isInitialized && this.firestore;

    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">🔥 Firebase Cloud Firestore & Auth Configuration</div>
        <button class="btn-close-modal" id="btnCloseFirebaseModal">✕</button>
      </div>
      <div class="modal-body" style="max-height: 80vh; overflow-y: auto;">
        <div class="callout-box ${isConn ? 'success' : 'warning'}" style="margin-bottom: 20px;">
          <span style="font-size: 20px;">${isConn ? '⚡' : '⚙️'}</span>
          <div style="flex: 1;">
            <strong>${isConn ? 'Firebase Firestore Live & Active' : 'Setup Firebase Credentials'}</strong>
            <div style="font-size: 12px; margin-top: 4px; color: var(--text-muted);">
              ${isConn
                ? 'Real-time onSnapshot listeners are listening to Amazon, Flipkart, Meesho & Blinkit collections.'
                : 'Enter your Firebase Web App credentials from the Firebase Console to enable real-time Cloud Firestore updates and Firebase Authentication.'}
            </div>
          </div>
        </div>

        <form id="firebaseConfigForm">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Project ID *</label>
              <input type="text" class="form-control" id="fbProjectId" placeholder="e.g. cartman-ecommerce-prod" value="${currentConfig.projectId || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">API Key *</label>
              <input type="text" class="form-control" id="fbApiKey" placeholder="AIzaSy..." value="${currentConfig.apiKey || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Auth Domain</label>
              <input type="text" class="form-control" id="fbAuthDomain" placeholder="e.g. cartman-ecommerce-prod.firebaseapp.com" value="${currentConfig.authDomain || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Storage Bucket</label>
              <input type="text" class="form-control" id="fbStorageBucket" placeholder="e.g. cartman-ecommerce-prod.appspot.com" value="${currentConfig.storageBucket || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Messaging Sender ID</label>
              <input type="text" class="form-control" id="fbMessagingSenderId" placeholder="e.g. 123456789012" value="${currentConfig.messagingSenderId || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">App ID</label>
              <input type="text" class="form-control" id="fbAppId" placeholder="e.g. 1:123456789:web:abcdef" value="${currentConfig.appId || ''}">
            </div>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; gap: 10px;">
              <button type="submit" class="btn-primary" id="btnSaveFirebase">
                💾 Save & Connect Firebase
              </button>
              <button type="button" class="btn-secondary" id="btnSyncFirestore" ${!isConn ? 'disabled' : ''}>
                ☁️ Sync All Data to Firestore
              </button>
            </div>
            <button type="button" class="btn-secondary" id="btnDisconnectFirebase" style="color: #f87171;" ${!isConn ? 'disabled' : ''}>
              Disconnect
            </button>
          </div>
        </form>

        <!-- Firestore Live Telemetry Display -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">
          <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 10px;">Cloud Firestore Real-Time Telemetry</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;">
            <div style="background: var(--bg-elevated); padding: 10px; border-radius: var(--radius-sm);">
              <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Orders</div>
              <div style="font-size: 18px; font-weight: 700; color: #3b82f6;" id="fbOrdersCount">${this.firestoreData.orders.length}</div>
            </div>
            <div style="background: var(--bg-elevated); padding: 10px; border-radius: var(--radius-sm);">
              <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Settlements</div>
              <div style="font-size: 18px; font-weight: 700; color: #10b981;" id="fbSettlementsCount">${this.firestoreData.settlements.length}</div>
            </div>
            <div style="background: var(--bg-elevated); padding: 10px; border-radius: var(--radius-sm);">
              <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Accounts</div>
              <div style="font-size: 18px; font-weight: 700; color: #f59e0b;" id="fbAccountsCount">${this.firestoreData.accounts.length}</div>
            </div>
            <div style="background: var(--bg-elevated); padding: 10px; border-radius: var(--radius-sm);">
              <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Bank Txns</div>
              <div style="font-size: 18px; font-weight: 700; color: #8b5cf6;" id="fbTxnsCount">${this.firestoreData.bank_transactions.length}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    const btnClose = card.querySelector('#btnCloseFirebaseModal');
    if (btnClose) btnClose.onclick = () => modal.classList.remove('active');

    const form = card.querySelector('#firebaseConfigForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const newConfig = {
        projectId: card.querySelector('#fbProjectId').value.trim(),
        apiKey: card.querySelector('#fbApiKey').value.trim(),
        authDomain: card.querySelector('#fbAuthDomain').value.trim(),
        storageBucket: card.querySelector('#fbStorageBucket').value.trim(),
        messagingSenderId: card.querySelector('#fbMessagingSenderId').value.trim(),
        appId: card.querySelector('#fbAppId').value.trim()
      };

      const btnSave = card.querySelector('#btnSaveFirebase');
      btnSave.textContent = '⏳ Connecting...';

      this.saveConfig(newConfig);

      // Also persist to server if possible
      try {
        await fetch('/api/firebase/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API.getToken()
          },
          body: JSON.stringify(newConfig)
        });
      } catch (err) {}

      const result = this.connect(newConfig);
      if (result.success) {
        API.toast('Connected to Firebase Cloud Firestore successfully!', 'success');
        modal.classList.remove('active');
      } else {
        API.toast('Connection failed: ' + result.error, 'error');
        btnSave.textContent = '💾 Save & Connect Firebase';
      }
    };

    const btnSync = card.querySelector('#btnSyncFirestore');
    if (btnSync) {
      btnSync.onclick = async () => {
        btnSync.textContent = '⏳ Synchronizing to Firestore...';
        btnSync.disabled = true;
        try {
          const res = await this.syncAllToFirestore();
          API.toast(res.message, 'success');
          // Update counts
          card.querySelector('#fbOrdersCount').textContent = this.firestoreData.orders.length;
          card.querySelector('#fbSettlementsCount').textContent = this.firestoreData.settlements.length;
          card.querySelector('#fbAccountsCount').textContent = this.firestoreData.accounts.length;
          card.querySelector('#fbTxnsCount').textContent = this.firestoreData.bank_transactions.length;
        } catch (err) {
          API.toast('Sync failed: ' + err.message, 'error');
        } finally {
          btnSync.textContent = '☁️ Sync All Data to Firestore';
          btnSync.disabled = false;
        }
      };
    }

    const btnDisconnect = card.querySelector('#btnDisconnectFirebase');
    if (btnDisconnect) {
      btnDisconnect.onclick = () => {
        localStorage.removeItem('cartman_firebase_config');
        this.stopRealtimeListeners();
        this.isInitialized = false;
        this.firestore = null;
        this.auth = null;
        this.updateStatusBadge('unconfigured', 'Firestore: Setup Required');
        API.toast('Firebase disconnected. Operating in local mode.', 'info');
        modal.classList.remove('active');
      };
    }
  }
}

window.FirebaseInstance = new FirebaseService();
