/**
 * Marketplace Accounts View Component
 * Multi-account drilldown, connection health, credential configuration, and account synchronization.
 */

const AccountsView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Loading connected seller accounts...</div>
      </div>
    `;

    try {
      const filterParams = window.AppState.getFilterParams();
      const overviewRes = await API.dashboard.getOverview(filterParams);
      const accounts = overviewRes.data.allAccounts || [];

      const fInr = (v) => API.formatInr(v);

      container.innerHTML = `
        ${window.isDemoMode ? `
          <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; color: #92400e;">
            <span style="font-size: 24px;">🔒</span>
            <div>
              <div style="font-weight: 700; font-size: 13.5px;">Disabled in Public Demo</div>
              <div style="font-size: 12px; margin-top: 2px;">Account additions, credential modifications, and marketplace sync jobs are locked in the public demo.</div>
            </div>
          </div>
        ` : ''}

        <div class="section-header">
          <div>
            <div class="section-title">Connected Marketplace Seller Accounts</div>
            <div style="font-size: 12px; color: var(--text-muted);">Manage multiple seller accounts across Amazon, Flipkart, Meesho, and Blinkit</div>
          </div>
          <button class="btn-primary" id="btnOpenAddAccountModal" ${window.isDemoMode ? 'style="opacity: 0.6; cursor: not-allowed;"' : ''}>
            ${window.isDemoMode ? '🔒 Connect New Account (Demo Locked)' : '➕ Connect New Seller Account'}
          </button>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Account & Seller ID</th>
                <th>Marketplace</th>
                <th>Status</th>
                <th class="text-right">Gross Sales</th>
                <th class="text-right">Net Sales</th>
                <th class="text-right">Orders</th>
                <th class="text-right">Settlements</th>
                <th class="text-right">Bank Receipts</th>
                <th class="text-right">Settlement Pending</th>
                <th>Last Synchronized</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${accounts.map(acc => `
                <tr>
                  <td>
                    <div style="font-weight: 700; color: #fff;">${acc.accountName}</div>
                    <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
                      Seller ID: <code>${acc.sellerId}</code>
                      ${acc.isDemo ? '<span class="badge-status duplicate" style="margin-left: 4px; font-size: 9px; padding: 1px 4px;">DEMO</span>' : ''}
                    </div>
                  </td>
                  <td>
                    <span style="font-weight: 600; text-transform: uppercase; font-size: 11.5px; color: var(--text-muted);">
                      ${acc.marketplace}
                    </span>
                  </td>
                  <td>
                    <span class="badge-status ${acc.connectionStatus}">
                      ${acc.connectionStatus}
                    </span>
                    ${acc.lastError ? `
                      <div style="font-size: 10px; color: var(--danger); margin-top: 3px; max-width: 140px; word-break: break-word;">
                        ${acc.lastError}
                      </div>
                    ` : ''}
                  </td>
                  <td class="text-right" style="font-weight: 600;">${fInr(acc.grossSales)}</td>
                  <td class="text-right" style="font-weight: 700; color: #34d399;">${fInr(acc.netSales)}</td>
                  <td class="text-right">
                    <strong>${acc.totalOrders}</strong>
                    <div style="font-size: 10.5px; color: var(--text-dim);">${acc.cancelledOrders} Canc / ${acc.returnedOrders} Ret</div>
                  </td>
                  <td class="text-right">${fInr(acc.totalSettlements)}</td>
                  <td class="text-right" style="color: #38bdf8;">${fInr(acc.bankReceipts)}</td>
                  <td class="text-right" style="color: #f87171; font-weight: 700;">${fInr(acc.settlementPending)}</td>
                  <td style="font-size: 11px; color: var(--text-dim);">
                    ${acc.lastSyncAt ? new Date(acc.lastSyncAt).toLocaleString('en-IN') : 'Never'}
                  </td>
                  <td>
                    <button class="btn-secondary btn-sync-single" data-id="${acc.accountId}" style="padding: 4px 10px; font-size: 11.5px;" title="Sync account now">
                      🔄 Sync
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      this.bindEvents(container);
    } catch (err) {
      container.innerHTML = `<div class="callout-box warning">Failed to load accounts: ${err.message}</div>`;
    }
  },

  bindEvents(container) {
    // Add Account Modal
    const addBtn = container.querySelector('#btnOpenAddAccountModal');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        this.showAddAccountModal();
      });
    }

    // Sync Account Single
    container.querySelectorAll('.btn-sync-single').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        const id = btn.getAttribute('data-id');
        btn.textContent = '⏳ Syncing...';
        btn.disabled = true;
        try {
          const res = await API.accounts.sync(id);
          API.toast(res.message || 'Account synced successfully!', 'success');
          this.render(container);
        } catch (e) {
          API.toast(e.message, 'error');
          btn.textContent = '🔄 Sync';
          btn.disabled = false;
        }
      });
    });
  },

  showAddAccountModal() {
    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');

    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">Connect New Marketplace Seller Account</div>
        <button class="btn-close-modal" id="btnCloseModal">✕</button>
      </div>
      <div class="modal-body">
        <form id="addAccountForm">
          <div class="form-group">
            <label class="form-label">Marketplace Platform *</label>
            <select class="form-control" id="accMarketplace" required>
              <option value="amazon">Amazon India (SP-API)</option>
              <option value="flipkart">Flipkart Seller (v3)</option>
              <option value="meesho">Meesho Supplier Panel</option>
              <option value="blinkit">Blinkit Partner Commerce</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Custom Display Name *</label>
            <input type="text" class="form-control" id="accDisplayName" placeholder="e.g. Cartman Prime Store 2" required>
          </div>

          <div class="form-group">
            <label class="form-label">Official Seller / Merchant ID *</label>
            <input type="text" class="form-control" id="accSellerId" placeholder="e.g. A236NPVTGV8S6Y or FK_SELLER_01" required>
          </div>

          <div id="dynamicCredentialFields">
            <!-- Rendered dynamically depending on marketplace selection -->
          </div>

          <div class="callout-box" style="margin-top: 16px; margin-bottom: 0;">
            <span style="font-size: 14px;">🔒</span>
            <div style="font-size: 11.5px;">All credentials and tokens are encrypted and protected on the backend server. Never exposed to browser clients.</div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="btnCancelModal">Cancel</button>
        <button class="btn-primary" id="btnSubmitAddAccount">Authenticate & Connect</button>
      </div>
    `;

    const select = card.querySelector('#accMarketplace');
    const renderCredFields = () => {
      const mkt = select.value;
      const credDiv = card.querySelector('#dynamicCredentialFields');
      if (mkt === 'amazon') {
        credDiv.innerHTML = `
          <div class="form-group">
            <label class="form-label">LWA Client ID *</label>
            <input type="text" class="form-control" id="cred_lwaClientId" placeholder="amzn1.application-oa2-client.xxx" required>
          </div>
          <div class="form-group">
            <label class="form-label">LWA Client Secret *</label>
            <input type="password" class="form-control" id="cred_lwaClientSecret" placeholder="Enter LWA secret key" required>
          </div>
          <div class="form-group">
            <label class="form-label">LWA Refresh Token</label>
            <input type="password" class="form-control" id="cred_refreshToken" placeholder="Atzr|xxx">
          </div>
        `;
      } else if (mkt === 'flipkart') {
        credDiv.innerHTML = `
          <div class="form-group">
            <label class="form-label">Flipkart App ID *</label>
            <input type="text" class="form-control" id="cred_appId" placeholder="Enter Application ID" required>
          </div>
          <div class="form-group">
            <label class="form-label">Flipkart App Secret *</label>
            <input type="password" class="form-control" id="cred_appSecret" placeholder="Enter Application Secret" required>
          </div>
        `;
      } else if (mkt === 'meesho') {
        credDiv.innerHTML = `
          <div class="form-group">
            <label class="form-label">Meesho Supplier API Token *</label>
            <input type="password" class="form-control" id="cred_apiToken" placeholder="Enter Bearer Token from Supplier Panel" required>
          </div>
        `;
      } else if (mkt === 'blinkit') {
        credDiv.innerHTML = `
          <div class="form-group">
            <label class="form-label">Blinkit Partner API Key *</label>
            <input type="password" class="form-control" id="cred_partnerKey" placeholder="Enter Partner API Key" required>
          </div>
          <div class="form-group">
            <label class="form-label">Warehouse Store IDs</label>
            <input type="text" class="form-control" id="cred_warehouseStoreIds" placeholder="e.g. WH_NCR_01, WH_MUM_02">
          </div>
        `;
      }
    };

    select.addEventListener('change', renderCredFields);
    renderCredFields();

    modal.classList.add('active');

    const closeModal = () => modal.classList.remove('active');
    card.querySelector('#btnCloseModal').onclick = closeModal;
    card.querySelector('#btnCancelModal').onclick = closeModal;

    card.querySelector('#btnSubmitAddAccount').onclick = async () => {
      const form = card.querySelector('#addAccountForm');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const marketplace = select.value;
      const accountName = card.querySelector('#accDisplayName').value;
      const sellerId = card.querySelector('#accSellerId').value;

      const credentials = {};
      card.querySelectorAll('[id^="cred_"]').forEach(inp => {
        const key = inp.id.replace('cred_', '');
        credentials[key] = inp.value;
      });

      const submitBtn = card.querySelector('#btnSubmitAddAccount');
      submitBtn.textContent = '⏳ Testing Connection...';
      submitBtn.disabled = true;

      try {
        const res = await API.accounts.create({
          marketplace,
          accountName,
          sellerId,
          credentials
        });
        API.toast(res.message, 'success');
        closeModal();
        AccountsView.render(document.getElementById('viewContainer'));
      } catch (err) {
        API.toast(err.message, 'error');
        submitBtn.textContent = 'Authenticate & Connect';
        submitBtn.disabled = false;
      }
    };
  },

  async renderPlatformAccounts(container, platformKey = 'amazon') {
    const key = (platformKey || 'amazon').toLowerCase();
    const platformDefs = {
      amazon: {
        name: 'Amazon',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:#232f3e;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 15c4 3 12 3 16 0" stroke="#FF9900" stroke-width="2.5" stroke-linecap="round"/><path d="M17.5 13.5l2.5 1.5-1.5 2.5" fill="#FF9900"/><text x="6" y="12" fill="#FFFFFF" font-size="11" font-weight="900" font-family="Arial, sans-serif">a</text></svg></span>`
      },
      flipkart: {
        name: 'Flipkart',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:#2874f0;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 7h12l-1.5 13h-9L6 7z" fill="#FFFFFF"/><path d="M9 7V4.5a2.5 2.5 0 015 0V7" stroke="#FFFFFF" stroke-width="2"/><text x="9.5" y="16" fill="#2874f0" font-size="11" font-weight="900" font-style="italic" font-family="Arial, sans-serif">f</text></svg></span>`
      },
      meesho: {
        name: 'Meesho',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:#9b2c89;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 18V8.5a2 2 0 014 0v5a2 2 0 004 0v-5a2 2 0 014 0V18" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
      },
      blinkit: {
        name: 'Blinkit',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:#f8cb46;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><text x="6" y="17" fill="#0c831f" font-size="16" font-weight="900" font-family="Arial, sans-serif">b</text></svg></span>`
      }
    };

    const pDef = platformDefs[key] || {
      name: key.charAt(0).toUpperCase() + key.slice(1),
      logoSvg: `<span style="font-size:20px;">🏪</span>`
    };

    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Loading ${pDef.name} seller accounts...</div>
      </div>
    `;

    try {
      const filterParams = window.AppState ? window.AppState.getFilterParams() : { period: 'monthly' };
      const overviewRes = await API.dashboard.getOverview(filterParams);
      const allAccounts = (overviewRes && overviewRes.data && overviewRes.data.allAccounts) || [];
      const platformAccounts = allAccounts.filter(acc => acc && acc.marketplace && acc.marketplace.toLowerCase() === key);
      const fInr = (v) => API.formatInr(v);

      container.innerHTML = `
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-top: 3px solid var(--primary); border-radius: var(--radius-md); padding: 28px 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04); margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 18px; border-bottom: 1px solid var(--border-subtle); margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <button id="btnBackToDashboard" style="display: inline-flex; align-items: center; gap: 6px; background: #ffffff; color: var(--text-main); border: 1.5px solid var(--border-color); padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;" title="Return to Dashboard">
                <span style="color: #059669; font-weight: 700;">←</span> Back to Dashboard
              </button>
              <div>
                <h1 style="font-size: 20px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;">
                  ${pDef.logoSvg}
                  <span>${pDef.name} Accounts</span>
                </h1>
                <p style="font-size: 12.5px; color: var(--text-muted); margin: 3px 0 0 0;">
                  Dedicated seller accounts and sales performance for ${pDef.name}
                </p>
              </div>
            </div>
            <span style="display: inline-flex; align-items: center; gap: 6px; background: var(--primary-light); color: #059669; border: 1px solid var(--primary-border); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
              ${platformAccounts.length} ${platformAccounts.length === 1 ? 'Account' : 'Accounts'}
            </span>
          </div>

          ${platformAccounts.length === 0 ? `
            <div style="background: #f8fafc; border: 1.5px dashed var(--border-color); border-radius: 8px; padding: 48px 24px; text-align: center;">
              <div style="font-size: 38px; margin-bottom: 10px;">📭</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                No accounts available
              </div>
              <div style="font-size: 13px; color: var(--text-muted); max-width: 440px; margin: 0 auto;">
                There are currently no connected seller accounts configured for ${pDef.name}.
              </div>
            </div>
          ` : `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px;">
              ${platformAccounts.map(acc => `
                <div style="background: #ffffff; border: 1px solid var(--border-color); border-left: 4px solid #10b981; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; flex-direction: column; justify-content: space-between;">
                  <div>
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px;">
                      <div>
                        <div style="font-size: 15px; font-weight: 700; color: var(--text-main); line-height: 1.3;">
                          ${acc.accountName || 'Unnamed Account'}
                        </div>
                        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
                          Account ID: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: var(--text-main); font-weight: 600;">${acc.sellerId || acc.accountId || 'N/A'}</code>
                        </div>
                      </div>
                      <span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: ${acc.connectionStatus === 'connected' ? '#dcfce7' : '#fef3c7'}; color: ${acc.connectionStatus === 'connected' ? '#166534' : '#92400e'}; border: 1px solid ${acc.connectionStatus === 'connected' ? '#86efac' : '#fde68a'}; text-transform: capitalize;">
                        ${acc.connectionStatus || 'Active'}
                      </span>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px 14px; margin-top: 14px;">
                      <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                        Account Sales
                      </div>
                      <div style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">
                        ${typeof acc.grossSales === 'number' ? fInr(acc.grossSales) : 'Sales data unavailable'}
                      </div>
                      ${typeof acc.netSales === 'number' && acc.netSales !== acc.grossSales ? `
                        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
                          Net Sales: <strong style="color: #059669;">${fInr(acc.netSales)}</strong>
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--text-dim);">
                    <span>${typeof acc.totalOrders === 'number' ? `${acc.totalOrders} Total Orders` : 'Orders data unavailable'}</span>
                    <span style="font-size: 10.5px; color: var(--text-muted);">${acc.lastSyncAt ? `Synced: ${new Date(acc.lastSyncAt).toLocaleDateString('en-IN')}` : ''}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;

      // Bind Back to Dashboard button
      const backBtn = container.querySelector('#btnBackToDashboard');
      if (backBtn) {
        backBtn.addEventListener('mouseenter', () => {
          backBtn.style.borderColor = '#10b981';
          backBtn.style.background = '#f0fdf4';
        });
        backBtn.addEventListener('mouseleave', () => {
          backBtn.style.borderColor = 'var(--border-color)';
          backBtn.style.background = '#ffffff';
        });
        backBtn.addEventListener('click', () => {
          if (window.AppState) {
            window.AppState.setActiveView('dashboard');
          }
        });
      }
    } catch (err) {
      container.innerHTML = `
        <div style="padding: 24px;">
          <div style="margin-bottom: 16px;">
            <button id="btnBackToDashboardErr" style="background: #ffffff; color: var(--text-main); border: 1.5px solid var(--border-color); padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
              ← Back to Dashboard
            </button>
          </div>
          <div class="callout-box warning">Failed to load platform accounts: ${err.message}</div>
        </div>
      `;
      const errBack = container.querySelector('#btnBackToDashboardErr');
      if (errBack) {
        errBack.onclick = () => window.AppState.setActiveView('dashboard');
      }
    }
  }
};

window.AccountsView = AccountsView;
