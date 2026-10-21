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

    // Check authentication before loading private views
    const isAuthenticated = await this.ensureAuthenticated();
    if (isAuthenticated) {
      this.routeView(window.AppState.get('activeView') || 'dashboard');
    }
  }

  async ensureAuthenticated() {
    const token = API.getToken();
    if (token) {
      try {
        const res = await API.auth.me();
        if (res && res.user) {
          window.AppState.setUser(res.user);
          this.updateUserUI(res.user);
          return true;
        }
      } catch (e) {
        console.warn('Session expired or invalid, prompting login...');
      }
    }

    // Unauthenticated: clear token and prompt login
    API.setToken(null);
    window.AppState.setUser(null);
    this.updateUserUI(null);
    this.showLoginModal();
    return false;
  }

  updateUserUI(user) {
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAvatar');
    const btnLogout = document.getElementById('btnLogout');

    if (!user) {
      if (nameEl) nameEl.textContent = 'Not Signed In';
      if (roleEl) {
        roleEl.textContent = 'Locked';
        roleEl.className = 'role-pill';
      }
      if (avatarEl) avatarEl.textContent = '🔒';
      if (btnLogout) {
        btnLogout.textContent = 'Sign In';
        btnLogout.title = 'Sign into your account';
      }
      return;
    }

    if (nameEl) nameEl.textContent = user.fullName || user.username || user.email;
    if (roleEl) {
      roleEl.textContent = user.role || 'Admin';
      roleEl.className = `role-pill ${(user.role || 'admin').toLowerCase()}`;
    }
    if (avatarEl) {
      avatarEl.textContent = (user.fullName || user.username || user.email).charAt(0).toUpperCase();
    }
    if (btnLogout) {
      btnLogout.textContent = 'Log Out';
      btnLogout.title = 'Sign out of dashboard';
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
      btnLogout.onclick = async () => {
        try {
          await API.auth.logout();
        } catch (e) {
          // ignore logout network errors
        }
        API.setToken(null);
        window.AppState.setUser(null);
        this.updateUserUI(null);
        API.toast('You have been signed out.', 'info');
        this.routeView(window.AppState.get('activeView') || 'dashboard');
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
    if (!window.AppState.get('user')) {
      if (this.pageTitle) {
        this.pageTitle.textContent = 'Sign In Required';
      }
      this.container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 420px; text-align: center; padding: 40px 20px;">
          <div style="font-size: 52px; margin-bottom: 16px;">🔐</div>
          <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">Authentication Required</h2>
          <p style="color: var(--text-dim); max-width: 440px; margin-bottom: 24px; line-height: 1.5; font-size: 14px;">
            This dashboard and its financial reports are protected. Please sign in with your verified owner email to continue.
          </p>
          <button class="btn-primary" id="btnPromptLogin" style="padding: 10px 24px; font-size: 14px; font-weight: 600;">
            ✉️ Sign In with Email OTP
          </button>
        </div>
      `;
      const btnPrompt = this.container.querySelector('#btnPromptLogin');
      if (btnPrompt) {
        btnPrompt.onclick = () => this.showLoginModal();
      }
      this.showLoginModal();
      return;
    }

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
    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');

    if (this._otpCountdownTimer) clearInterval(this._otpCountdownTimer);
    if (this._otpResendTimer) clearInterval(this._otpResendTimer);

    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">🔐 Cartman Dashboard Access</div>
        <button class="btn-close-modal" id="btnCloseLoginModal" style="display: none;">✕</button>
      </div>
      <div class="modal-body">
        <!-- Auth Method Selector Tabs -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
          <button type="button" class="btn-secondary active" id="tabEmailOtpAuth" style="flex: 1; justify-content: center; font-size: 13px; font-weight: 600;">
            ✉️ Email OTP Login
          </button>
          <button type="button" class="btn-secondary" id="tabFirebaseAuth" style="flex: 1; justify-content: center; font-size: 13px;">
            🔥 Firebase Auth
          </button>
        </div>

        <!-- 1. Passwordless Email OTP Login -->
        <div id="sectionEmailOtpAuth">
          <!-- Step 1: Request OTP -->
          <div id="otpStep1">
            <div style="margin-bottom: 16px; font-size: 13px; color: var(--text-muted); line-height: 1.5;">
              Enter your authorized owner email address to receive a secure 6-digit one-time login code.
            </div>
            <form id="otpRequestForm" onsubmit="return false;">
              <div class="form-group">
                <label class="form-label" for="otpEmailInput">Owner Email Address *</label>
                <input type="email" class="form-control" id="otpEmailInput" placeholder="e.g. owner@cartman.com" autocomplete="email" required style="font-size: 14px; padding: 10px 12px;">
              </div>
              <div style="margin-top: 18px;">
                <button type="submit" class="btn-primary" id="btnSendOtp" style="width: 100%; justify-content: center; padding: 11px; font-size: 14px; font-weight: 600;">
                  ✉️ Send Verification Code
                </button>
              </div>
            </form>
          </div>

          <!-- Step 2: Verify OTP -->
          <div id="otpStep2" style="display: none;">
            <div id="devMockBanner" style="display: none; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; font-size: 13px; color: #92400e; line-height: 1.5;">
              💻 <strong>Local Development Mode:</strong><br>
              Real email delivery is not configured (RESEND_API_KEY is unset).<br>
              Your 6-digit verification code has been printed to your <strong>server terminal console</strong>.
            </div>

            <div style="background: var(--bg-hover, #f8fafc); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between;">
              <div style="font-size: 13px; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">
                <span>Code sent to: </span>
                <strong id="otpTargetEmailText" style="color: var(--primary, #2563eb);"></strong>
              </div>
              <button type="button" id="btnChangeEmail" style="background: none; border: none; color: var(--primary, #2563eb); font-size: 12px; cursor: pointer; text-decoration: underline; padding: 0;">
                Change
              </button>
            </div>

            <form id="otpVerifyForm" onsubmit="return false;">
              <div class="form-group">
                <label class="form-label" for="otpCodeInput">6-Digit Verification Code *</label>
                <input type="text" class="form-control" id="otpCodeInput" placeholder="123456" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required style="font-size: 24px; letter-spacing: 8px; text-align: center; font-weight: 700; padding: 10px;">
              </div>

              <!-- Expiry & Resend Bar -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 12px;">
                <div id="otpCountdownTimer" style="color: var(--text-muted); font-weight: 500;">
                  ⏱️ Expires in: <span id="otpCountdownValue" style="font-weight: 700; color: #d97706;">05:00</span>
                </div>
                <button type="button" id="btnResendOtp" style="background: none; border: none; color: var(--primary, #2563eb); font-size: 12px; cursor: pointer; font-weight: 600; padding: 2px 4px;" disabled>
                  Resend Code (30s)
                </button>
              </div>

              <div style="margin-top: 18px;">
                <button type="submit" class="btn-primary" id="btnSubmitOtp" style="width: 100%; justify-content: center; padding: 11px; font-size: 14px; font-weight: 600; background: #10b981;">
                  🔓 Verify & Enter Dashboard
                </button>
              </div>
            </form>
          </div>

          <!-- Fallback: Local Username & Password -->
          <div style="margin-top: 22px; border-top: 1px dashed var(--border-color); padding-top: 14px; text-align: center;">
            <button type="button" id="togglePasswordLogin" style="background: none; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; text-decoration: underline;">
              🔑 Sign in with Username & Password (Local Backup)
            </button>

            <div id="sectionPasswordLogin" style="display: none; margin-top: 14px; text-align: left; padding: 14px; background: var(--bg-hover, #f8fafc); border-radius: 8px; border: 1px solid var(--border-color);">
              <form id="legacyLoginForm" onsubmit="return false;">
                <div class="form-group">
                  <label class="form-label" for="loginUsername">Username *</label>
                  <input type="text" class="form-control" id="loginUsername" placeholder="Configured username" autocomplete="username">
                </div>
                <div class="form-group" style="margin-top: 12px;">
                  <label class="form-label" for="loginPassword">Password *</label>
                  <input type="password" class="form-control" id="loginPassword" placeholder="Configured password" autocomplete="current-password">
                </div>
                <button type="submit" class="btn-primary" id="btnLoginSubmit" style="width: 100%; justify-content: center; margin-top: 14px; font-size: 13px; font-weight: 600;">
                  Sign In with Password
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- 2. Firebase Authentication -->
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
              <input type="email" class="form-control" id="fbLoginEmail" placeholder="user@company.com">
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

    // Close button (only shown if already authenticated)
    const btnClose = card.querySelector('#btnCloseLoginModal');
    if (window.AppState && window.AppState.get('user')) {
      btnClose.style.display = 'block';
      btnClose.onclick = () => {
        if (this._otpCountdownTimer) clearInterval(this._otpCountdownTimer);
        if (this._otpResendTimer) clearInterval(this._otpResendTimer);
        modal.classList.remove('active');
      };
    }

    // Tab switching
    const tabEmailOtp = card.querySelector('#tabEmailOtpAuth');
    const tabFirebase = card.querySelector('#tabFirebaseAuth');
    const secEmailOtp = card.querySelector('#sectionEmailOtpAuth');
    const secFirebase = card.querySelector('#sectionFirebaseAuth');

    tabEmailOtp.onclick = () => {
      tabEmailOtp.classList.add('active');
      tabFirebase.classList.remove('active');
      secEmailOtp.style.display = 'block';
      secFirebase.style.display = 'none';
    };

    tabFirebase.onclick = () => {
      tabFirebase.classList.add('active');
      tabEmailOtp.classList.remove('active');
      secFirebase.style.display = 'block';
      secEmailOtp.style.display = 'none';
    };

    // Firebase Auth Mode switch
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

    // ==========================================
    // Email OTP Authentication Handlers
    // ==========================================
    const step1 = card.querySelector('#otpStep1');
    const step2 = card.querySelector('#otpStep2');
    const emailInput = card.querySelector('#otpEmailInput');
    const codeInput = card.querySelector('#otpCodeInput');
    const btnSendOtp = card.querySelector('#btnSendOtp');
    const btnSubmitOtp = card.querySelector('#btnSubmitOtp');
    const btnResendOtp = card.querySelector('#btnResendOtp');
    const btnChangeEmail = card.querySelector('#btnChangeEmail');
    const countdownValue = card.querySelector('#otpCountdownValue');
    const targetEmailText = card.querySelector('#otpTargetEmailText');

    let currentEmail = '';
    let currentChallengeToken = '';
    let remainingSeconds = 300;
    let resendCooldown = 30;

    const updateTimerDisplay = (isExpired = false) => {
      if (!countdownValue) return;
      if (isExpired) {
        countdownValue.innerHTML = '<span style="color: #ef4444; font-weight: 700;">Expired!</span>';
        btnSubmitOtp.disabled = true;
        btnSubmitOtp.style.opacity = '0.6';
      } else {
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        countdownValue.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        btnSubmitOtp.disabled = false;
        btnSubmitOtp.style.opacity = '1';
      }
    };

    const startCountdown = (duration = 300) => {
      if (this._otpCountdownTimer) clearInterval(this._otpCountdownTimer);
      remainingSeconds = duration;
      updateTimerDisplay(false);
      this._otpCountdownTimer = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds <= 0) {
          clearInterval(this._otpCountdownTimer);
          remainingSeconds = 0;
          updateTimerDisplay(true);
        } else {
          updateTimerDisplay(false);
        }
      }, 1000);
    };

    const startResendCooldown = (duration = 30) => {
      if (this._otpResendTimer) clearInterval(this._otpResendTimer);
      resendCooldown = duration;
      btnResendOtp.disabled = true;
      btnResendOtp.textContent = `Resend Code (${resendCooldown}s)`;
      this._otpResendTimer = setInterval(() => {
        resendCooldown--;
        if (resendCooldown <= 0) {
          clearInterval(this._otpResendTimer);
          btnResendOtp.disabled = false;
          btnResendOtp.textContent = '🔄 Resend Code';
        } else {
          btnResendOtp.textContent = `Resend Code (${resendCooldown}s)`;
        }
      }, 1000);
    };

    // Auto-focus email on open
    setTimeout(() => {
      if (emailInput) emailInput.focus();
    }, 150);

    const handleSendOtp = async (e) => {
      if (e) e.preventDefault();
      const email = (emailInput.value || '').trim();
      if (!email || !email.includes('@')) {
        API.toast('Please enter a valid owner email address.', 'error');
        return;
      }

      btnSendOtp.disabled = true;
      btnSendOtp.textContent = '⏳ Sending Code...';

      try {
        const res = await API.auth.requestOtp(email);
        currentEmail = email;
        currentChallengeToken = res.challengeToken || '';
        targetEmailText.textContent = email;

        const devBanner = card.querySelector('#devMockBanner');
        if (devBanner) {
          devBanner.style.display = res.deliveryMode === 'dev_mock' ? 'block' : 'none';
        }

        step1.style.display = 'none';
        step2.style.display = 'block';
        codeInput.value = '';

        startCountdown(res.expiresInSeconds || 300);
        startResendCooldown(30);

        setTimeout(() => codeInput.focus(), 150);
        API.toast(res.message || 'Verification code sent to your email!', 'info');
      } catch (err) {
        API.toast(err.message || 'Failed to send verification code.', 'error');
      } finally {
        btnSendOtp.disabled = false;
        btnSendOtp.textContent = '✉️ Send Verification Code';
      }
    };

    card.querySelector('#otpRequestForm').onsubmit = handleSendOtp;
    btnSendOtp.onclick = handleSendOtp;

    btnResendOtp.onclick = async () => {
      if (!currentEmail || resendCooldown > 0) return;
      btnResendOtp.disabled = true;
      btnResendOtp.textContent = '⏳ Resending...';
      try {
        const res = await API.auth.requestOtp(currentEmail);
        currentChallengeToken = res.challengeToken || '';
        const devBanner = card.querySelector('#devMockBanner');
        if (devBanner) {
          devBanner.style.display = res.deliveryMode === 'dev_mock' ? 'block' : 'none';
        }
        startCountdown(res.expiresInSeconds || 300);
        startResendCooldown(30);
        codeInput.value = '';
        codeInput.focus();
        API.toast('New verification code sent to your email!', 'info');
      } catch (err) {
        API.toast(err.message || 'Failed to resend code.', 'error');
        btnResendOtp.disabled = false;
        btnResendOtp.textContent = '🔄 Resend Code';
      }
    };

    btnChangeEmail.onclick = (e) => {
      e.preventDefault();
      if (this._otpCountdownTimer) clearInterval(this._otpCountdownTimer);
      if (this._otpResendTimer) clearInterval(this._otpResendTimer);
      const devBanner = card.querySelector('#devMockBanner');
      if (devBanner) devBanner.style.display = 'none';
      step2.style.display = 'none';
      step1.style.display = 'block';
      emailInput.focus();
    };

    const handleVerifyOtp = async (e) => {
      if (e) e.preventDefault();
      const code = (codeInput.value || '').trim();
      if (!code || !/^\d{6}$/.test(code)) {
        API.toast('Please enter the complete 6-digit verification code.', 'error');
        codeInput.focus();
        return;
      }

      btnSubmitOtp.disabled = true;
      btnSubmitOtp.textContent = '⏳ Verifying...';

      try {
        const res = await API.auth.verifyOtp(currentEmail, code, currentChallengeToken);
        if (this._otpCountdownTimer) clearInterval(this._otpCountdownTimer);
        if (this._otpResendTimer) clearInterval(this._otpResendTimer);

        API.setToken(res.token);
        window.AppState.setUser(res.user);
        this.updateUserUI(res.user);
        API.toast(`Welcome back, ${res.user.fullName || res.user.email || 'Admin'}!`, 'success');
        modal.classList.remove('active');
        this.routeView(window.AppState.get('activeView') || 'dashboard');
      } catch (err) {
        API.toast(err.message || 'Invalid or expired verification code.', 'error');
        btnSubmitOtp.disabled = false;
        btnSubmitOtp.textContent = '🔓 Verify & Enter Dashboard';
        codeInput.select();
      }
    };

    card.querySelector('#otpVerifyForm').onsubmit = handleVerifyOtp;
    btnSubmitOtp.onclick = handleVerifyOtp;

    // ==========================================
    // Legacy Password Login Fallback (Local Backup)
    // ==========================================
    const togglePassBtn = card.querySelector('#togglePasswordLogin');
    const secPassword = card.querySelector('#sectionPasswordLogin');
    const legacyForm = card.querySelector('#legacyLoginForm');
    const btnLegacySubmit = card.querySelector('#btnLoginSubmit');
    const legacyUserInput = card.querySelector('#loginUsername');
    const legacyPassInput = card.querySelector('#loginPassword');

    togglePassBtn.onclick = (e) => {
      e.preventDefault();
      const isHidden = secPassword.style.display === 'none';
      secPassword.style.display = isHidden ? 'block' : 'none';
      togglePassBtn.textContent = isHidden
        ? '▲ Hide Username & Password Login'
        : '🔑 Sign in with Username & Password (Local Backup)';
      if (isHidden && legacyUserInput) {
        legacyUserInput.focus();
      }
    };

    const handleLegacyLogin = async (e) => {
      if (e) e.preventDefault();
      const username = legacyUserInput.value.trim();
      const password = legacyPassInput.value;

      if (!username || !password) {
        API.toast('Please enter your username and password.', 'error');
        return;
      }

      btnLegacySubmit.textContent = '⏳ Verifying...';
      btnLegacySubmit.disabled = true;

      try {
        const res = await API.auth.login(username, password);
        if (this._otpCountdownTimer) clearInterval(this._otpCountdownTimer);
        if (this._otpResendTimer) clearInterval(this._otpResendTimer);

        API.setToken(res.token);
        window.AppState.setUser(res.user);
        this.updateUserUI(res.user);
        API.toast(`Welcome back, ${res.user.fullName || res.user.username}!`, 'success');
        modal.classList.remove('active');
        this.routeView(window.AppState.get('activeView') || 'dashboard');
      } catch (err) {
        API.toast(err.message || 'Login failed.', 'error');
        btnLegacySubmit.textContent = 'Sign In with Password';
        btnLegacySubmit.disabled = false;
        legacyPassInput.value = '';
        legacyPassInput.focus();
      }
    };

    legacyForm.onsubmit = handleLegacyLogin;
    btnLegacySubmit.onclick = handleLegacyLogin;

    // ==========================================
    // Firebase Auth Handlers
    // ==========================================
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
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.CartmanInstance = new CartmanApp();
  window.CartmanInstance.init();
});
