/**
 * Main Application Orchestrator & View Router
 */

class CartmanApp {
  constructor() {
    this.container = document.getElementById('viewContainer');
    this.sidebar = document.getElementById('appSidebar');
    this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
    this.pageTitle = document.getElementById('pageTitle');
    this.demoCheckbox = document.getElementById('demoToggleCheckbox');
    this.demoLabel = document.getElementById('demoLabel');
    this.dateContainer = document.getElementById('dateInputsContainer');
  }

  async init() {
    console.log('[App] Initializing Cartman Dashboard...');
    this.bindGlobalEvents();
    this.renderDateFilterControls();

    // Firebase connection deferred per Step 1 requirements
    // if (window.FirebaseInstance) {
    //   await window.FirebaseInstance.init();
    // }

    // Check or bootstrap authentication
    await this.ensureAuthenticated();

    // Route to initial view
    this.routeView(window.AppState.get('activeView') || 'dashboard');
  }

  async ensureAuthenticated() {
    // 1. Check system status to detect public demo mode
    try {
      const statusRes = await fetch('/api/status').then(r => r.json()).catch(() => null);
      if (statusRes && statusRes.isDemoMode) {
        window.isDemoMode = true;
        window.AppState.set('isDemoMode', true);
        window.AppState.setIncludeDemo(true);
        const guestUser = {
          id: 'demo_guest',
          fullName: 'Demo Guest',
          email: 'guest@cartmandemo.com',
          role: 'Viewer'
        };
        window.AppState.setUser(guestUser);
        this.updateUserUI(guestUser);
        this.renderDemoBanner();
        return;
      }
    } catch (e) {
      console.warn('[App] Status check failed:', e);
    }

    const token = API.getToken();
    if (token) {
      try {
        const res = await API.auth.me();
        if (res.isDemoMode) {
          window.isDemoMode = true;
          window.AppState.set('isDemoMode', true);
          window.AppState.setIncludeDemo(true);
          this.renderDemoBanner();
        }
        window.AppState.setUser(res.user);
        this.updateUserUI(res.user);
        return;
      } catch (e) {
        console.warn('Session expired or invalid, re-authenticating...');
      }
    }

    // Auto-login as default Admin for seamless immediate experience in non-demo mode
    try {
      const loginRes = await API.auth.login('admin@cartman.com', 'CartmanAdmin2026!');
      const verifyRes = await API.auth.verifyOtp('admin@cartman.com', loginRes.devOtp || '123456');
      API.setToken(verifyRes.token);
      window.AppState.setUser(verifyRes.user);
      this.updateUserUI(verifyRes.user);
    } catch (e) {
      console.error('Auto-login failed, presenting login modal:', e.message);
      this.showLoginModal();
    }
  }

  renderDemoBanner() {
    if (document.getElementById('demoModeBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'demoModeBanner';
    banner.style.cssText = 'background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); border-bottom: 2px solid #10b981; color: #f8fafc; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; z-index: 50; flex-wrap: wrap; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.5px;">PUBLIC DEMO</span>
        <span>Viewing read-only demo with sample marketplace data. File uploads, imports, account edits, and background sync are locked.</span>
      </div>
      <span style="color: #94a3b8; font-size: 12px; font-weight: 500;">🔒 Read-Only Guest Mode</span>
    `;

    const topHeader = document.querySelector('.top-header');
    if (topHeader && topHeader.parentNode) {
      topHeader.parentNode.insertBefore(banner, topHeader.nextSibling);
    }
  }

  updateUserUI(user) {
    if (!user) return;
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAvatar');

    if (nameEl) nameEl.textContent = user.fullName || user.email;
    if (roleEl) {
      roleEl.textContent = user.role;
      roleEl.className = `role-pill ${user.role.toLowerCase()}`;
    }
    if (avatarEl) {
      avatarEl.textContent = (user.fullName || user.email).charAt(0).toUpperCase();
    }

    if (window.isDemoMode) {
      const btnLogout = document.getElementById('btnLogout');
      if (btnLogout) {
        btnLogout.textContent = 'Guest Mode';
        btnLogout.title = 'Public Demo Guest Mode (No sign in needed)';
        btnLogout.style.opacity = '0.75';
      }
    }
  }

  bindGlobalEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        this.routeView(view);
        if (window.innerWidth <= 900) {
          this.sidebar.classList.remove('open');
        }
      });
    });

    // Mobile Menu Toggle
    if (this.mobileMenuBtn) {
      this.mobileMenuBtn.onclick = () => this.sidebar.classList.toggle('open');
    }

    // Demo Data Toggle Switch
    if (this.demoCheckbox) {
      this.demoCheckbox.checked = window.AppState.get('includeDemo');
      this.demoCheckbox.onchange = () => {
        const isChecked = this.demoCheckbox.checked;
        window.AppState.setIncludeDemo(isChecked);
        if (this.demoLabel) {
          this.demoLabel.textContent = isChecked ? 'DEMO DATA' : 'LIVE DATA';
          this.demoLabel.style.color = isChecked ? '#fbbf24' : '#34d399';
        }
      };
    }

    // Period buttons (Daily, Monthly, Custom)
    document.querySelectorAll('.btn-period').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const period = btn.getAttribute('data-period');
        window.AppState.setDateFilter({ period });
        this.renderDateFilterControls();
      };
    });

    // Refresh Button
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
      btnRefresh.onclick = () => {
        this.routeView(window.AppState.get('activeView'));
        API.toast('Data refreshed.', 'info');
      };
    }

    // Sync Now Button
    const btnSyncNow = document.getElementById('btnSyncNow');
    if (btnSyncNow) {
      btnSyncNow.onclick = async () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        btnSyncNow.textContent = '⏳ Syncing...';
        btnSyncNow.disabled = true;
        try {
          await API.integrations.syncAll();
          API.toast('Marketplace sync finished successfully!', 'success');
          this.routeView(window.AppState.get('activeView'));
        } catch (e) {
          API.toast(e.message, 'error');
        } finally {
          btnSyncNow.textContent = '⚡ Sync Now';
          btnSyncNow.disabled = false;
        }
      };
    }

    // Logout Button
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.onclick = () => {
        if (window.isDemoMode) {
          API.toast('Public demo is active with sample data. No sign-in or credentials needed.', 'info');
          return;
        }
        API.setToken(null);
        window.AppState.setUser(null);
        this.showLoginModal();
      };
    }

    // State Change Subscriptions
    window.AppState.subscribe('filterChange', () => {
      this.routeView(window.AppState.get('activeView'));
    });

    window.AppState.subscribe('activeView', (view) => {
      this.routeView(view);
    });

    // Real-time Firestore Live Event Subscriptions
    ['orders', 'settlements', 'accounts', 'bank_transactions'].forEach(col => {
      window.AppState.subscribe(`firestore_${col}_updated`, () => {
        const active = window.AppState.get('activeView');
        if (['dashboard', 'orders', 'accounts', 'reconciliation'].includes(active)) {
          this.routeView(active);
          API.toast(`Live update received from Firebase Cloud Firestore for ${col}!`, 'info');
        }
      });
    });
  }

  renderDateFilterControls() {
    if (!this.dateContainer) return;
    const filter = window.AppState.get('dateFilter');

    if (filter.period === 'daily') {
      this.dateContainer.innerHTML = `
        <span style="font-size: 12px; color: var(--text-dim);">Date:</span>
        <input type="date" class="date-input" id="filterDailyInput" value="${filter.date}">
      `;
      const inp = this.dateContainer.querySelector('#filterDailyInput');
      inp.onchange = () => window.AppState.setDateFilter({ date: inp.value });
    } else if (filter.period === 'monthly') {
      this.dateContainer.innerHTML = `
        <span style="font-size: 12px; color: var(--text-dim);">Month:</span>
        <input type="month" class="date-input" id="filterMonthlyInput" value="${filter.month}">
      `;
      const inp = this.dateContainer.querySelector('#filterMonthlyInput');
      inp.onchange = () => window.AppState.setDateFilter({ month: inp.value });
    } else if (filter.period === 'custom') {
      this.dateContainer.innerHTML = `
        <span style="font-size: 12px; color: var(--text-dim);">From:</span>
        <input type="date" class="date-input" id="filterStartInput" value="${filter.startDate}">
        <span style="font-size: 12px; color: var(--text-dim);">To:</span>
        <input type="date" class="date-input" id="filterEndInput" value="${filter.endDate}">
      `;
      const startInp = this.dateContainer.querySelector('#filterStartInput');
      const endInp = this.dateContainer.querySelector('#filterEndInput');
      const updateCustom = () => {
        if (startInp.value && endInp.value) {
          window.AppState.setDateFilter({ startDate: startInp.value, endDate: endInp.value });
        }
      };
      startInp.onchange = updateCustom;
      endInp.onchange = updateCustom;
    }
  }

  routeView(viewName) {
    const titles = {
      dashboard: 'Company Overview Dashboard',
      'sales-upload': 'Sales Report Upload & Verification',
      accounts: 'Marketplace Seller Accounts',
      orders: 'Order Summary & Status Mapping',
      reconciliation: 'Payment & Settlement Reconciliation',
      'bank-import': 'Bank Statement Imports',
      reports: 'Financial Reports & Exports',
      users: 'Users & Permissions',
      integrations: 'Integrations & Scheduled Sync',
      settings: 'Settings & Audit Trail'
    };

    if (viewName && viewName.startsWith('accounts-')) {
      const pKey = viewName.replace('accounts-', '');
      const pNames = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho', blinkit: 'Blinkit' };
      const platformName = pNames[pKey.toLowerCase()] || (pKey.charAt(0).toUpperCase() + pKey.slice(1));
      if (this.pageTitle) {
        this.pageTitle.textContent = `${platformName} Accounts`;
      }
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
      });
      AccountsView.renderPlatformAccounts(this.container, pKey);
      return;
    }

    if (this.pageTitle) {
      this.pageTitle.textContent = titles[viewName] || 'Cartman Dashboard';
    }

    // Update active nav class
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Render corresponding view component
    if (viewName === 'dashboard') {
      DashboardView.render(this.container);
    } else if (viewName === 'sales-upload') {
      SalesReportUploadView.render(this.container);
    } else if (viewName === 'accounts') {
      const selectedPlatform = window.AppState ? window.AppState.get('selectedPlatform') : null;
      if (selectedPlatform) {
        AccountsView.renderPlatformAccounts(this.container, selectedPlatform);
      } else {
        AccountsView.render(this.container);
      }
    } else if (viewName === 'orders') {
      OrdersView.render(this.container);
    } else if (viewName === 'reconciliation') {
      ReconciliationView.render(this.container);
    } else if (viewName === 'bank-import') {
      BankImportView.render(this.container);
    } else if (viewName === 'reports') {
      ReportsView.render(this.container);
    } else if (viewName === 'users') {
      UsersView.render(this.container);
    } else if (viewName === 'integrations') {
      IntegrationsView.render(this.container);
    } else if (viewName === 'settings') {
      SettingsView.render(this.container);
    } else {
      DashboardView.render(this.container);
    }
  }

  showLoginModal() {
    if (window.isDemoMode) {
      API.toast('Public demo is active with sample data. No login required.', 'info');
      return;
    }
    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');

    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">🔐 Cartman Secure Authentication</div>
        <button class="btn-close-modal" id="btnCloseLoginModal" style="display: none;">✕</button>
      </div>
      <div class="modal-body">
        <!-- Auth Method Selector Tabs -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
          <button type="button" class="btn-secondary active" id="tabCartmanAuth" style="flex: 1; justify-content: center; font-size: 12.5px;">
            🛡️ 2FA OTP Login
          </button>
          <button type="button" class="btn-secondary" id="tabFirebaseAuth" style="flex: 1; justify-content: center; font-size: 12.5px;">
            🔥 Firebase Auth & OTP
          </button>
        </div>

        <!-- 1. Standard 2FA Form -->
        <div id="sectionCartmanAuth">
          <form id="loginForm">
            <div id="loginStep1">
              <div class="form-group">
                <label class="form-label">Email Address *</label>
                <input type="email" class="form-control" id="loginEmail" value="admin@cartman.com" required>
              </div>
              <div class="form-group">
                <label class="form-label">Password *</label>
                <input type="password" class="form-control" id="loginPassword" value="CartmanAdmin2026!" required>
              </div>
              <div style="font-size: 11.5px; color: var(--text-dim); margin-top: 4px;">
                Default Accounts:<br>
                • Admin: <code>admin@cartman.com</code> / <code>CartmanAdmin2026!</code><br>
                • Accounts: <code>accounts@cartman.com</code> / <code>CartmanAcc2026!</code><br>
                • Staff: <code>staff@cartman.com</code> / <code>CartmanStaff2026!</code>
              </div>
              <div style="margin-top: 16px;">
                <button type="button" class="btn-primary" id="btnRequestOtp" style="width: 100%; justify-content: center;">
                  Verify Password & Dispatch OTP
                </button>
              </div>
            </div>

            <div id="loginStep2" style="display: none;">
              <div class="callout-box" style="margin-bottom: 16px;">
                <span>📲</span>
                <div>
                  <strong>OTP Sent!</strong> A 6-digit verification code has been dispatched. For convenience, use dev test code <code id="displayDevOtp">123456</code>.
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Enter 6-Digit OTP Code *</label>
                <input type="text" class="form-control" id="loginOtpInput" placeholder="Enter 6-digit OTP" maxlength="6" style="font-size: 20px; letter-spacing: 4px; text-align: center;" required>
              </div>
              <div style="margin-top: 16px;">
                <button type="button" class="btn-primary" id="btnVerifyOtp" style="width: 100%; justify-content: center; background: #10b981;">
                  Verify OTP & Enter Dashboard
                </button>
              </div>
            </div>
          </form>
        </div>

        <!-- 2. Firebase Authentication (Email/Password or Phone OTP) -->
        <div id="sectionFirebaseAuth" style="display: none;">
          <div style="margin-bottom: 14px; font-size: 12px; color: var(--text-muted);">
            Sign in directly using Firebase Cloud Authentication.
          </div>

          <div class="form-group">
            <label class="form-label">Firebase Auth Mode</label>
            <select class="form-control" id="fbAuthMode">
              <option value="email">Email & Password</option>
              <option value="phone">Phone & SMS OTP Verification</option>
            </select>
          </div>

          <!-- Firebase Email/Pass Form -->
          <div id="fbEmailSection">
            <div class="form-group">
              <label class="form-label">Firebase User Email</label>
              <input type="email" class="form-control" id="fbLoginEmail" placeholder="admin@cartman.com">
            </div>
            <div class="form-group">
              <label class="form-label">Firebase Password</label>
              <input type="password" class="form-control" id="fbLoginPassword" placeholder="••••••••">
            </div>
            <button type="button" class="btn-primary" id="btnFirebaseEmailLogin" style="width: 100%; justify-content: center; margin-top: 12px;">
              🔥 Sign In with Firebase Email
            </button>
          </div>

          <!-- Firebase Phone OTP Form -->
          <div id="fbPhoneSection" style="display: none;">
            <div class="form-group">
              <label class="form-label">Phone Number (with Country Code) *</label>
              <input type="tel" class="form-control" id="fbPhoneNumber" placeholder="+91 98765 43210">
            </div>
            <div id="recaptchaContainer" style="margin-bottom: 12px;"></div>
            <button type="button" class="btn-primary" id="btnSendPhoneOtp" style="width: 100%; justify-content: center;">
              📲 Send Firebase SMS OTP
            </button>

            <div id="fbPhoneOtpVerifySection" style="display: none; margin-top: 16px;">
              <div class="form-group">
                <label class="form-label">Enter 6-Digit SMS Code *</label>
                <input type="text" class="form-control" id="fbPhoneOtpCode" placeholder="123456" maxlength="6" style="font-size: 20px; letter-spacing: 4px; text-align: center;">
              </div>
              <button type="button" class="btn-primary" id="btnVerifyPhoneOtp" style="width: 100%; justify-content: center; background: #10b981;">
                Verify SMS Code & Enter
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Tab switching
    const tabCartman = card.querySelector('#tabCartmanAuth');
    const tabFirebase = card.querySelector('#tabFirebaseAuth');
    const secCartman = card.querySelector('#sectionCartmanAuth');
    const secFirebase = card.querySelector('#sectionFirebaseAuth');

    tabCartman.onclick = () => {
      tabCartman.classList.add('active');
      tabFirebase.classList.remove('active');
      secCartman.style.display = 'block';
      secFirebase.style.display = 'none';
    };

    tabFirebase.onclick = () => {
      tabFirebase.classList.add('active');
      tabCartman.classList.remove('active');
      secFirebase.style.display = 'block';
      secCartman.style.display = 'none';
    };

    // Firebase Auth Mode change
    const fbMode = card.querySelector('#fbAuthMode');
    const fbEmailSec = card.querySelector('#fbEmailSection');
    const fbPhoneSec = card.querySelector('#fbPhoneSection');

    fbMode.onchange = () => {
      if (fbMode.value === 'phone') {
        fbEmailSec.style.display = 'none';
        fbPhoneSec.style.display = 'block';
      } else {
        fbEmailSec.style.display = 'block';
        fbPhoneSec.style.display = 'none';
      }
    };

    // Firebase Email Login Button
    const btnFbEmail = card.querySelector('#btnFirebaseEmailLogin');
    btnFbEmail.onclick = async () => {
      const email = card.querySelector('#fbLoginEmail').value.trim();
      const pass = card.querySelector('#fbLoginPassword').value;
      if (!email || !pass) {
        API.toast('Please enter Firebase email and password.', 'error');
        return;
      }
      btnFbEmail.textContent = '⏳ Authenticating...';
      try {
        if (!window.FirebaseInstance || !window.FirebaseInstance.auth) {
          throw new Error('Firebase Auth is not configured yet. Click the Firebase button at top right to enter credentials.');
        }
        await window.FirebaseInstance.loginWithEmailPassword(email, pass);
        API.toast('Signed in via Firebase Authentication!', 'success');
        modal.classList.remove('active');
        this.routeView(window.AppState.get('activeView') || 'dashboard');
      } catch (err) {
        API.toast(err.message, 'error');
        btnFbEmail.textContent = '🔥 Sign In with Firebase Email';
      }
    };

    // Firebase Phone OTP flow
    const btnSendPhone = card.querySelector('#btnSendPhoneOtp');
    const btnVerifyPhone = card.querySelector('#btnVerifyPhoneOtp');
    const phoneVerifySec = card.querySelector('#fbPhoneOtpVerifySection');

    btnSendPhone.onclick = async () => {
      const phone = card.querySelector('#fbPhoneNumber').value.trim();
      if (!phone) {
        API.toast('Please enter phone number with country code.', 'error');
        return;
      }
      btnSendPhone.textContent = '⏳ Sending SMS...';
      try {
        if (!window.FirebaseInstance || !window.FirebaseInstance.auth) {
          throw new Error('Firebase Auth is not configured. Please configure Firebase first.');
        }
        await window.FirebaseInstance.sendPhoneOtp(phone);
        API.toast('SMS verification code sent!', 'info');
        phoneVerifySec.style.display = 'block';
        btnSendPhone.textContent = 'Resend Code';
      } catch (err) {
        API.toast(err.message, 'error');
        btnSendPhone.textContent = '📲 Send Firebase SMS OTP';
      }
    };

    btnVerifyPhone.onclick = async () => {
      const code = card.querySelector('#fbPhoneOtpCode').value.trim();
      if (!code) {
        API.toast('Please enter 6-digit SMS code.', 'error');
        return;
      }
      btnVerifyPhone.textContent = '⏳ Verifying code...';
      try {
        await window.FirebaseInstance.verifyPhoneOtp(code);
        API.toast('Phone verification successful!', 'success');
        modal.classList.remove('active');
        this.routeView(window.AppState.get('activeView') || 'dashboard');
      } catch (err) {
        API.toast(err.message, 'error');
        btnVerifyPhone.textContent = 'Verify SMS Code & Enter';
      }
    };

    // Standard 2FA OTP flow
    let pendingEmail = '';
    const step1 = card.querySelector('#loginStep1');
    const step2 = card.querySelector('#loginStep2');
    const btnRequest = card.querySelector('#btnRequestOtp');
    const btnVerify = card.querySelector('#btnVerifyOtp');
    const emailInp = card.querySelector('#loginEmail');
    const passInp = card.querySelector('#loginPassword');
    const otpInp = card.querySelector('#loginOtpInput');
    const displayOtp = card.querySelector('#displayDevOtp');

    btnRequest.onclick = async () => {
      const email = emailInp.value;
      const pass = passInp.value;
      if (!email || !pass) {
        API.toast('Please enter email and password.', 'error');
        return;
      }
      btnRequest.textContent = '⏳ Verifying...';
      try {
        const res = await API.auth.login(email, pass);
        pendingEmail = res.email;
        if (res.devOtp) {
          displayOtp.textContent = res.devOtp;
          otpInp.value = res.devOtp;
        }
        step1.style.display = 'none';
        step2.style.display = 'block';
        API.toast('Password verified. Enter 6-digit OTP.', 'info');
      } catch (err) {
        API.toast(err.message, 'error');
        btnRequest.textContent = 'Verify Password & Dispatch OTP';
      }
    };

    btnVerify.onclick = async () => {
      const otp = otpInp.value;
      if (!otp) {
        API.toast('Please enter 6-digit OTP.', 'error');
        return;
      }
      btnVerify.textContent = '⏳ Authenticating...';
      try {
        const res = await API.auth.verifyOtp(pendingEmail, otp);
        API.setToken(res.token);
        window.AppState.setUser(res.user);
        this.updateUserUI(res.user);
        API.toast(`Welcome back, ${res.user.fullName}!`, 'success');
        modal.classList.remove('active');
        this.routeView(window.AppState.get('activeView') || 'dashboard');
      } catch (err) {
        API.toast(err.message, 'error');
        btnVerify.textContent = 'Verify OTP & Enter Dashboard';
      }
    };
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.CartmanInstance = new CartmanApp();
  window.CartmanInstance.init();
});
