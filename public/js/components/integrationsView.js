/**
 * Marketplace Integrations & Synchronization Monitor View
 * Displays verified official API specifications, fallback report ingestion tool,
 * and live synchronization background job telemetry.
 */

const IntegrationsView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Loading official integration specifications...</div>
      </div>
    `;

    try {
      const [specsRes, logsRes, accountsRes] = await Promise.all([
        API.integrations.getSpecs(),
        API.integrations.getSyncLogs(),
        API.accounts.getAll()
      ]);

      const specs = specsRes.data || {};
      const logs = logsRes.data || [];
      const accounts = accountsRes.data || [];

      container.innerHTML = `
        ${window.isDemoMode ? `
          <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; color: #92400e;">
            <span style="font-size: 24px;">🔒</span>
            <div>
              <div style="font-weight: 700; font-size: 13.5px;">Disabled in Public Demo</div>
              <div style="font-size: 12px; margin-top: 2px;">Marketplace synchronization and fallback report ingestion are locked in the public demo. Sample logs and metrics are displayed.</div>
            </div>
          </div>
        ` : ''}

        <div class="section-header">
          <div>
            <div class="section-title">Official Marketplace Integrations & Synchronization</div>
            <div style="font-size: 12px; color: var(--text-muted);">Verified API endpoints, credentials specifications, and scheduled background synchronization</div>
          </div>
          <button class="btn-primary" id="btnSyncAllNow" ${window.isDemoMode ? 'style="opacity: 0.6; cursor: not-allowed;"' : ''}>
            ${window.isDemoMode ? '🔒 Run Synchronization (Demo Locked)' : '⚡ Run Synchronization Across All Accounts'}
          </button>
        </div>

        <!-- 1. Marketplace API Specifications Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 28px;">
          ${Object.values(specs).map(sp => {
            const mktAccounts = accounts.filter(a => a.marketplace === sp.id);
            return `
              <div class="metric-card" style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                  <div>
                    <div style="font-size: 15px; font-weight: 700; color: #fff;">${sp.name}</div>
                    <div style="font-size: 11px; color: #34d399; font-weight: 600; margin-top: 2px;">● ${sp.apiStatus}</div>
                  </div>
                  <span class="badge-status connected">${mktAccounts.length} Connected</span>
                </div>

                <div style="font-size: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
                  <div><strong>Auth Type:</strong> <span style="color: var(--text-muted);">${sp.authType}</span></div>
                  <div><strong>Endpoint:</strong> <code style="font-size: 11px;">${sp.endpoints.apiBase || sp.endpoints.tokenUrl}</code></div>
                  <div><strong>Rate Limit:</strong> <span style="color: var(--text-muted);">${sp.rateLimits.ordersApi || sp.rateLimits.general}</span></div>
                </div>

                <div style="font-size: 11.5px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px;">Supported Fallback Reports:</div>
                <ul style="list-style: none; font-size: 11.5px; color: var(--text-muted); margin-bottom: 16px;">
                  ${sp.fallbackReportTypes.map(f => `<li>• ${f}</li>`).join('')}
                </ul>

                <button class="btn-secondary btn-upload-fallback-report" data-mkt="${sp.id}" style="width: 100%; justify-content: center; font-size: 12px;">
                  📁 Ingest ${sp.id.toUpperCase()} Report File
                </button>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 2. Fallback Report Ingestion Tool -->
        <div id="reportUploadContainer" style="display: none; background: var(--bg-card); border: 2px solid var(--primary); border-radius: var(--radius-md); padding: 24px; margin-bottom: 28px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div style="font-size: 16px; font-weight: 700; color: #fff;">Fallback Marketplace Report File Ingestion</div>
            <button class="btn-close-modal" id="btnCloseReportUpload">✕</button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label">Target Seller Account *</label>
              <select class="form-control" id="targetAccountIdSelect">
                ${accounts.map(a => `<option value="${a.id}">${a.accountName} (${a.marketplace.toUpperCase()})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Select Report File (.xlsx, .csv) *</label>
              <input type="file" class="form-control" id="marketplaceReportFile" accept=".xlsx,.xls,.csv">
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end;">
            <button class="btn-primary" id="btnSubmitReportIngest">Ingest & Populate Records</button>
          </div>
        </div>

        <!-- 3. Scheduled Sync Telemetry Log Table -->
        <div class="section-header">
          <div class="section-title">Background Synchronization Execution History</div>
          <div style="font-size: 12px; color: var(--text-muted);">Configured Interval: Every 15 Minutes</div>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Execution Timestamp</th>
                <th>Marketplace & Account</th>
                <th>Trigger Type</th>
                <th>Status</th>
                <th class="text-right">Records Processed</th>
                <th>Error Details</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? `
                <tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 24px;">No sync events recorded yet. Click "Run Synchronization" above to execute.</td></tr>
              ` : logs.map(l => {
                const acc = accounts.find(a => a.id === l.accountId);
                return `
                  <tr>
                    <td style="font-size: 11.5px; white-space: nowrap;">${new Date(l.startedAt).toLocaleString('en-IN')}</td>
                    <td>
                      <div><strong>${acc ? acc.accountName : 'All Accounts'}</strong></div>
                      <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted);">${l.marketplace}</div>
                    </td>
                    <td><span class="role-pill staff">${l.syncType}</span></td>
                    <td><span class="badge-status ${l.status === 'success' ? 'connected' : 'cancelled'}">${l.status}</span></td>
                    <td class="text-right" style="font-weight: 700;">${l.recordsProcessed || 0}</td>
                    <td style="font-size: 11px; color: ${l.errorMessage ? 'var(--danger)' : 'var(--text-dim)'}; max-width: 200px;">
                      ${l.errorMessage || 'None (Completed smoothly)'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      this.bindEvents(container);
    } catch (err) {
      container.innerHTML = `<div class="callout-box warning">Failed to load integrations: ${err.message}</div>`;
    }
  },

  bindEvents(container) {
    // Bulk Sync Button
    const bulkBtn = container.querySelector('#btnSyncAllNow');
    if (bulkBtn) {
      bulkBtn.onclick = async () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        bulkBtn.textContent = '⏳ Synchronizing all accounts...';
        bulkBtn.disabled = true;
        try {
          const res = await API.integrations.syncAll();
          API.toast(res.message, 'success');
          this.render(container);
        } catch (e) {
          API.toast(e.message, 'error');
          bulkBtn.textContent = '⚡ Run Synchronization Across All Accounts';
          bulkBtn.disabled = false;
        }
      };
    }

    // Toggle Report Upload Section
    const uploadArea = container.querySelector('#reportUploadContainer');
    const closeUploadBtn = container.querySelector('#btnCloseReportUpload');

    container.querySelectorAll('.btn-upload-fallback-report').forEach(btn => {
      btn.onclick = () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        uploadArea.style.display = 'block';
        uploadArea.scrollIntoView({ behavior: 'smooth' });
      };
    });

    if (closeUploadBtn) {
      closeUploadBtn.onclick = () => { uploadArea.style.display = 'none'; };
    }

    // Submit Report Ingestion
    const submitBtn = container.querySelector('#btnSubmitReportIngest');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const fileInp = container.querySelector('#marketplaceReportFile');
        const accSelect = container.querySelector('#targetAccountIdSelect');

        if (!fileInp.files || !fileInp.files[0]) {
          API.toast('Please choose a report file first.', 'error');
          return;
        }

        const formData = new FormData();
        formData.append('reportFile', fileInp.files[0]);
        formData.append('accountId', accSelect.value);
        // Find marketplace
        const accOption = accSelect.options[accSelect.selectedIndex].text;
        let mkt = 'amazon';
        if (accOption.includes('FLIPKART')) mkt = 'flipkart';
        else if (accOption.includes('MEESHO')) mkt = 'meesho';
        else if (accOption.includes('BLINKIT')) mkt = 'blinkit';

        formData.append('marketplace', mkt);

        submitBtn.textContent = '⏳ Parsing & Ingesting Records...';
        submitBtn.disabled = true;

        try {
          const res = await API.integrations.uploadReport(formData);
          API.toast(`Ingested ${res.ordersIngested} orders and ${res.settlementsIngested} settlements!`, 'success');
          uploadArea.style.display = 'none';
          this.render(container);
        } catch (err) {
          API.toast(err.message, 'error');
          submitBtn.textContent = 'Ingest & Populate Records';
          submitBtn.disabled = false;
        }
      };
    }
  }
};
