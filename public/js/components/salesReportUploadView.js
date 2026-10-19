/**
 * Sales Report Upload & Account Identification View Component
 * Provides:
 * 1. Marketplace and seller account selection (with auto-detect option)
 * 2. File upload / drag-and-drop supporting .pdf, .csv, .xls, .xlsx, .txt
 * 3. File validation (type & size)
 * 4. Content-based account identification & mismatch conflict protection
 * 5. Pre-import preview of extracted rows, date range, and parsing warnings
 * 6. Explicit confirmation step and deduplication reporting
 */

const SalesReportUploadView = {
  selectedFile: null,
  accounts: [],
  previewData: null,

  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Loading sales report engine...</div>
      </div>
    `;

    try {
      const accountsRes = await API.salesReport.getAccounts();
      this.accounts = accountsRes.accounts || [];
      this.selectedFile = null;
      this.previewData = null;

      container.innerHTML = `
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-top: 3px solid var(--primary); border-radius: var(--radius-md); padding: 28px 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04); margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 18px; border-bottom: 1px solid var(--border-subtle); margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <button id="btnBackToDashboardFromUpload" style="display: inline-flex; align-items: center; gap: 6px; background: #ffffff; color: var(--text-main); border: 1.5px solid var(--border-color); padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                <span style="color: #059669; font-weight: 700;">←</span> Back to Dashboard
              </button>
              <div>
                <h1 style="font-size: 20px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;">
                  <span>📤</span>
                  <span>Sales Report Upload & Verification</span>
                </h1>
                <p style="font-size: 12.5px; color: var(--text-muted); margin: 3px 0 0 0;">
                  Import marketplace sales reports (.pdf, .csv, .xls, .xlsx, .txt) with verified seller-account identification
                </p>
              </div>
            </div>
            <span style="display: inline-flex; align-items: center; gap: 6px; background: var(--primary-light); color: #059669; border: 1px solid var(--primary-border); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
              Zero Fake Data • Strict Validation
            </span>
          </div>

          ${window.isDemoMode ? `
            <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; color: #92400e;">
              <span style="font-size: 24px;">🔒</span>
              <div>
                <div style="font-weight: 700; font-size: 13.5px;">Disabled in Public Demo</div>
                <div style="font-size: 12px; margin-top: 2px;">File uploads and report imports are locked in public demo mode. Pre-seeded sample marketplace data is active across all dashboard analytics.</div>
              </div>
            </div>
          ` : ''}

          <!-- Upload Configuration Box -->
          <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 20px;">
              <div>
                <label style="display: block; font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                  1. Target Marketplace Platform
                </label>
                <select id="selectMarketplace" style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border-color); border-radius: 6px; font-size: 13px; background: #ffffff; color: var(--text-main); outline: none;">
                  <option value="">Auto-Detect from Report Content</option>
                  <option value="amazon">Amazon (5 accounts)</option>
                  <option value="flipkart">Flipkart (3 accounts)</option>
                  <option value="meesho">Meesho (4 accounts)</option>
                  <option value="blinkit">Blinkit (2 accounts)</option>
                </select>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                  Selecting a platform filters the accounts to only that platform's registered accounts.
                </div>
              </div>

              <div>
                <label style="display: block; font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                  2. Target Seller Account
                </label>
                <select id="selectAccount" style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border-color); border-radius: 6px; font-size: 13px; background: #ffffff; color: var(--text-main); outline: none;">
                  <!-- Populated dynamically based on platform -->
                </select>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                  Choose an account label to attribute sales data (14 registered accounts in total).
                </div>
              </div>
            </div>

            <!-- Drag & Drop Zone -->
            <div id="salesDropzone" style="border: 2px dashed ${window.isDemoMode ? '#94a3b8' : '#10b981'}; background: #ffffff; border-radius: 8px; padding: 36px 20px; text-align: center; cursor: ${window.isDemoMode ? 'not-allowed' : 'pointer'}; transition: all 0.2s ease;">
              <input type="file" id="salesFileInput" accept=".pdf,.csv,.tsv,.txt,.xlsx,.xls" style="display: none;" ${window.isDemoMode ? 'disabled' : ''}>
              <div style="font-size: 38px; margin-bottom: 8px;">${window.isDemoMode ? '🔒' : '📑'}</div>
              <div style="font-size: 15px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;" id="dropzoneMainText">
                ${window.isDemoMode ? 'File Uploads Disabled in Public Demo' : 'Drag & drop your Sales Report here or click to browse'}
              </div>
              <div style="font-size: 12px; color: var(--text-muted);">
                ${window.isDemoMode ? 'All data-changing actions are locked in read-only public demo mode' : 'Supports official PDF, CSV, XLS, XLSX, and TXT files (Max: 25MB)'}
              </div>
            </div>

            <!-- Error message placeholder -->
            <div id="fileUploadError" style="display: none; margin-top: 14px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 12px 16px; border-radius: 6px; font-size: 13px;"></div>

            <!-- Inspect Button Area -->
            <div id="inspectActionArea" style="display: none; margin-top: 18px; align-items: center; justify-content: space-between; background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 18px;">
              <div id="selectedFileSummary" style="font-size: 13px; font-weight: 600; color: var(--text-main);"></div>
              <button id="btnInspectReport" style="background: var(--primary); color: #ffffff; border: none; padding: 9px 20px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.2s ease;">
                🔍 Inspect & Preview Report
              </button>
            </div>
          </div>

          <!-- Preview & Validation Inspection Area -->
          <div id="previewContainer" style="display: none;"></div>
        </div>
      `;

      this.bindEvents(container);
    } catch (err) {
      container.innerHTML = `
        <div style="padding: 24px;">
          <div class="callout-box warning">Failed to load sales report view: ${err.message}</div>
        </div>
      `;
    }
  },

  bindEvents(container) {
    const backBtn = container.querySelector('#btnBackToDashboardFromUpload');
    if (backBtn) {
      backBtn.onclick = () => window.AppState.setActiveView('dashboard');
    }

    const dropzone = container.querySelector('#salesDropzone');
    const fileInput = container.querySelector('#salesFileInput');
    const inspectBtn = container.querySelector('#btnInspectReport');
    const errDiv = container.querySelector('#fileUploadError');
    const inspectArea = container.querySelector('#inspectActionArea');
    const fileSummary = container.querySelector('#selectedFileSummary');
    const selectMkt = container.querySelector('#selectMarketplace');
    const selectAcc = container.querySelector('#selectAccount');

    const showFileError = (msg) => {
      errDiv.textContent = msg;
      errDiv.style.display = 'block';
      inspectArea.style.display = 'none';
      this.selectedFile = null;
    };

    const clearFileError = () => {
      errDiv.textContent = '';
      errDiv.style.display = 'none';
    };

    // Click dropzone to browse
    dropzone.onclick = () => {
      if (window.isDemoMode) {
        API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
        return;
      }
      fileInput.click();
    };

    // Drag and drop events
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        if (window.isDemoMode) return;
        dropzone.style.background = '#f0fdf4';
        dropzone.style.borderColor = '#059669';
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        if (window.isDemoMode) return;
        dropzone.style.background = '#ffffff';
        dropzone.style.borderColor = '#10b981';
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (window.isDemoMode) {
        API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
        return;
      }
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.handleFileSelected(files[0], container);
      }
    });

    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files.length > 0) {
        this.handleFileSelected(fileInput.files[0], container);
      }
    };

    // Initial populate of account dropdown
    this.populateAccountDropdown(selectAcc, selectMkt ? selectMkt.value : '');

    // Platform selection change: strictly show ONLY that platform's registered accounts (Requirement 3)
    if (selectMkt) {
      selectMkt.onchange = () => {
        this.populateAccountDropdown(selectAcc, selectMkt.value);
        this.updateTargetConfirmation(container);
      };
    }

    // Account selection change: auto-sync platform if not set
    if (selectAcc) {
      selectAcc.onchange = () => {
        const selectedId = selectAcc.value;
        if (selectedId) {
          const acc = this.accounts.find(a => a.id === selectedId);
          if (acc && selectMkt && (!selectMkt.value || selectMkt.value.toLowerCase() !== acc.marketplace.toLowerCase())) {
            selectMkt.value = acc.marketplace;
            this.populateAccountDropdown(selectAcc, acc.marketplace, acc.id);
          }
        }
        this.updateTargetConfirmation(container);
      };
    }

    // Inspect & Preview click
    inspectBtn.onclick = () => this.runPreview(container);
  },

  populateAccountDropdown(selectAcc, selectedMarketplace = '', preselectedId = '') {
    if (!selectAcc) return;
    const mkt = (selectedMarketplace || '').toLowerCase().trim();
    const platformNames = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho', blinkit: 'Blinkit' };

    if (!mkt) {
      // Group all 14 registered accounts by platform
      const platforms = ['amazon', 'flipkart', 'meesho', 'blinkit'];
      let html = '<option value="">Auto-Detect from Report Content</option>';
      for (const p of platforms) {
        const pAccounts = this.accounts.filter(a => (a.marketplace || '').toLowerCase() === p);
        if (pAccounts.length > 0) {
          html += `<optgroup label="${platformNames[p]} (${pAccounts.length} accounts)">`;
          for (const a of pAccounts) {
            const isSel = (preselectedId && preselectedId === a.id) ? 'selected' : '';
            html += `<option value="${a.id}" data-marketplace="${a.marketplace}" ${isSel}>${a.accountName} (${platformNames[p]})</option>`;
          }
          html += `</optgroup>`;
        }
      }
      selectAcc.innerHTML = html;
      return;
    }

    // Filter to strictly ONLY selected platform's registered accounts (Requirement 3)
    const filtered = this.accounts.filter(a => (a.marketplace || '').toLowerCase() === mkt);
    const pName = platformNames[mkt] || mkt.toUpperCase();

    let html = `<option value="">-- Select ${pName} Account (${filtered.length} registered) --</option>`;
    for (const a of filtered) {
      const isSel = (preselectedId && preselectedId === a.id) ? 'selected' : '';
      html += `<option value="${a.id}" data-marketplace="${a.marketplace}" ${isSel}>${a.accountName}</option>`;
    }
    selectAcc.innerHTML = html;
  },

  getTargetDetails(container) {
    const selectMkt = container.querySelector('#selectMarketplace');
    const selectAcc = container.querySelector('#selectAccount');
    const chosenAccountId = selectAcc ? selectAcc.value : '';
    const acc = this.accounts.find(a => a.id === chosenAccountId);
    const mkt = (acc ? acc.marketplace : (selectMkt ? selectMkt.value : '')) || (this.previewData ? this.previewData.detectedMarketplace : '');
    const platformNames = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho', blinkit: 'Blinkit' };
    const platformName = platformNames[(mkt || '').toLowerCase()] || (mkt ? mkt.toUpperCase() : 'Generic Platform');
    const accountName = acc ? acc.accountName : (this.previewData && this.previewData.detectedAccount ? this.previewData.detectedAccount.accountName : null);

    // Check verification: either verified by detected sellerId match, or unverified manual selection
    const isVerified = !!(this.previewData && this.previewData.accountIdentityVerified);
    const verificationNotice = isVerified
      ? (this.previewData && this.previewData.verificationNotice ? this.previewData.verificationNotice : 'Account identity verified via detected seller identifier.')
      : (accountName
          ? `Account identity has not been independently verified. Account name was selected manually as '${accountName}'. Account names are labels only until verified account identifiers become available.`
          : 'Please select a registered seller account to confirm report ingestion.');

    return {
      accountId: chosenAccountId || (acc ? acc.id : null),
      accountName,
      platform: mkt,
      platformName,
      isVerified,
      verificationNotice
    };
  },

  updateTargetConfirmation(container) {
    if (!this.previewData) return;
    const target = this.getTargetDetails(container);

    const targetPlat = container.querySelector('#targetPlatformDisplay');
    const targetAcc = container.querySelector('#targetAccountDisplay');
    const targetBadge = container.querySelector('#targetVerificationBadge');
    const targetNotice = container.querySelector('#targetVerificationNoticeText');
    const confirmTitle = container.querySelector('#confirmTargetTitle');
    const confirmSub = container.querySelector('#confirmTargetSubtitle');
    const confirmBtn = container.querySelector('#btnConfirmImport');

    if (targetPlat) targetPlat.textContent = target.platformName;
    if (targetAcc) {
      targetAcc.textContent = target.accountName || '⚠️ No Account Selected';
      targetAcc.style.color = target.accountName ? '#047857' : '#dc2626';
    }
    if (targetBadge) {
      targetBadge.innerHTML = target.isVerified ? '✓ Verified ID Match' : '⚠️ Unverified Identity (Manual Selection)';
      targetBadge.style.background = target.isVerified ? '#d1fae5' : '#fef3c7';
      targetBadge.style.color = target.isVerified ? '#065f46' : '#92400e';
      targetBadge.style.borderColor = target.isVerified ? '#a7f3d0' : '#fde68a';
    }
    if (targetNotice) {
      targetNotice.innerHTML = `<strong>Verification Notice:</strong> ${target.verificationNotice}`;
      targetNotice.style.color = target.isVerified ? '#047857' : '#92400e';
      targetNotice.style.background = target.isVerified ? '#f0fdf4' : '#fffbeb';
      targetNotice.style.borderColor = target.isVerified ? '#bbf7d0' : '#fde68a';
    }
    if (confirmTitle) {
      confirmTitle.textContent = `Confirm Ingestion into ${target.accountName ? `'${target.accountName}' (${target.platformName})` : 'Cartman Database'}`;
    }
    if (confirmSub) {
      if (this.previewData.hasConflict) {
        confirmSub.textContent = 'Import is currently disabled due to detection conflict.';
      } else if (this.previewData.validRowsCount === 0) {
        confirmSub.textContent = 'Import is disabled because 0 valid records were found in this report.';
      } else if (!target.accountId) {
        confirmSub.textContent = 'Please select a seller account above to enable import.';
      } else if (this.previewData.isDailySummary) {
        confirmSub.textContent = `Click confirm to persist ${this.previewData.validRowsCount} validated daily business summary rows into '${target.accountName}'. Existing duplicate dates will be skipped automatically.`;
      } else {
        confirmSub.textContent = `Click confirm to persist ${this.previewData.validRowsCount} validated sales orders. Duplicate order IDs will be skipped automatically.`;
      }
    }
    if (confirmBtn) {
      if (this.previewData.validRowsCount === 0) {
        confirmBtn.textContent = '🚫 Cannot Import (0 Records Extracted)';
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.cursor = 'not-allowed';
      } else if (this.previewData.hasConflict || !target.accountId) {
        confirmBtn.textContent = this.previewData.isDailySummary
          ? `✓ Confirm & Import Daily Summaries into ${target.accountName || 'Account'} (${target.platformName})`
          : `✓ Confirm & Import into ${target.accountName || 'Account'} (${target.platformName})`;
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.cursor = 'not-allowed';
      } else {
        confirmBtn.textContent = this.previewData.isDailySummary
          ? `✓ Confirm & Import Daily Summaries into ${target.accountName || 'Account'} (${target.platformName})`
          : `✓ Confirm & Import into ${target.accountName || 'Account'} (${target.platformName})`;
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.onclick = () => this.runImport(container);
      }
    }
  },

  handleFileSelected(file, container) {
    const errDiv = container.querySelector('#fileUploadError');
    const inspectArea = container.querySelector('#inspectActionArea');
    const fileSummary = container.querySelector('#selectedFileSummary');
    const previewContainer = container.querySelector('#previewContainer');
    previewContainer.style.display = 'none';

    // 1. Validate file extension
    const validExtensions = ['pdf', 'csv', 'tsv', 'txt', 'xlsx', 'xls'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    if (!validExtensions.includes(ext)) {
      errDiv.textContent = `Unsupported file type '.${ext}'. Please upload a valid CSV, XLSX, XLS, TXT, or PDF sales report.`;
      errDiv.style.display = 'block';
      inspectArea.style.display = 'none';
      this.selectedFile = null;
      return;
    }

    // 2. Validate file size (25MB max)
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      errDiv.textContent = `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 25MB maximum limit.`;
      errDiv.style.display = 'block';
      inspectArea.style.display = 'none';
      this.selectedFile = null;
      return;
    }

    // 3. Validate non-empty
    if (file.size === 0) {
      errDiv.textContent = 'Selected file is empty (0 bytes). Please upload a valid report.';
      errDiv.style.display = 'block';
      inspectArea.style.display = 'none';
      this.selectedFile = null;
      return;
    }

    errDiv.style.display = 'none';
    this.selectedFile = file;

    fileSummary.innerHTML = `
      <span>📄 ${file.name}</span>
      <span style="font-weight: 400; color: var(--text-muted); margin-left: 8px;">(${(file.size / 1024).toFixed(1)} KB)</span>
    `;
    inspectArea.style.display = 'flex';
  },

  async runPreview(container) {
    if (!this.selectedFile) return;

    const inspectBtn = container.querySelector('#btnInspectReport');
    const previewContainer = container.querySelector('#previewContainer');
    const selectMkt = container.querySelector('#selectMarketplace');
    const selectAcc = container.querySelector('#selectAccount');

    inspectBtn.textContent = '⏳ Inspecting & Parsing...';
    inspectBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('reportFile', this.selectedFile);
      if (selectMkt.value) formData.append('marketplace', selectMkt.value);
      if (selectAcc.value) formData.append('accountId', selectAcc.value);

      const res = await API.salesReport.preview(formData);
      this.previewData = res;
      this.renderPreview(container, res);
    } catch (err) {
      previewContainer.innerHTML = `
        <div style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 8px; padding: 20px; color: #991b1b; margin-top: 20px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">❌ Report Inspection Error</div>
          <div style="font-size: 13px;">${err.message}</div>
        </div>
      `;
      previewContainer.style.display = 'block';
    } finally {
      inspectBtn.textContent = '🔍 Inspect & Preview Report';
      inspectBtn.disabled = false;
    }
  },

  renderPreview(container, data) {
    const previewContainer = container.querySelector('#previewContainer');
    const selectAcc = container.querySelector('#selectAccount');
    const selectMkt = container.querySelector('#selectMarketplace');
    const fInr = (v) => API.formatInr(v);

    // Auto-select detected account in dropdown if identified
    if (data.detectedAccount && data.detectedAccount.id) {
      if (data.detectedAccount.marketplace && (!selectMkt.value || selectMkt.value !== data.detectedAccount.marketplace)) {
        selectMkt.value = data.detectedAccount.marketplace;
        this.populateAccountDropdown(selectAcc, data.detectedAccount.marketplace, data.detectedAccount.id);
      } else {
        selectAcc.value = data.detectedAccount.id;
      }
    }

    const target = this.getTargetDetails(container);

    previewContainer.innerHTML = `
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 24px; margin-top: 24px;">
        <h2 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <span>📋</span> Pre-Import Verification & Preview
        </h2>

        <!-- Conflict Error Banner (Blocks Import) -->
        ${data.hasConflict ? `
          <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 18px 20px; margin-bottom: 20px; color: #991b1b;">
            <div style="font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span>🚫</span> Conflict Detected — Import Blocked
            </div>
            <div style="font-size: 13px; line-height: 1.5;">${data.conflictReason}</div>
            <div style="font-size: 12px; margin-top: 8px; font-weight: 600;">
              Please adjust your target marketplace / seller account selection to match the verified identifiers in the report.
            </div>
          </div>
        ` : ''}

        <!-- Duplicate File Warning -->
        ${data.isDuplicateFile ? `
          <div style="background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; color: #92400e;">
            <div style="font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span>⚠️</span> Exact Duplicate File Detected
            </div>
            <div style="font-size: 12.5px;">
              This exact file was already imported previously for account '<strong>${data.duplicateInfo ? data.duplicateInfo.accountName : ''}</strong>'.
              Re-importing identical files will skip existing records to prevent duplicate data.
            </div>
          </div>
        ` : ''}

        <!-- Target Ingestion & Verification Status Box -->
        <div id="previewTargetDestinationBox" style="background: #ffffff; border: 1.5px solid ${target.isVerified ? '#86efac' : '#fed7aa'}; border-left: 5px solid ${target.isVerified ? '#10b981' : '#f59e0b'}; border-radius: 8px; padding: 18px 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                Target Ingestion Destination (Platform & Account)
              </div>
              <div style="font-size: 16px; font-weight: 800; color: var(--text-main); margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                <span id="targetPlatformDisplay" style="color: #1e293b;">${target.platformName}</span>
                <span style="color: var(--text-muted); font-weight: 400;">→</span>
                <span id="targetAccountDisplay" style="color: ${target.accountName ? '#047857' : '#dc2626'};">${target.accountName || '⚠️ No Account Selected'}</span>
              </div>
            </div>
            <div>
              <span id="targetVerificationBadge" style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 16px; font-size: 12px; font-weight: 700; ${target.isVerified ? 'background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0;' : 'background: #fef3c7; color: #92400e; border: 1px solid #fde68a;'}">
                ${target.isVerified ? '✓ Verified ID Match' : '⚠️ Unverified Identity (Manual Selection)'}
              </span>
            </div>
          </div>
          <div id="targetVerificationNoticeText" style="margin-top: 10px; font-size: 12.5px; color: ${target.isVerified ? '#047857' : '#92400e'}; line-height: 1.45; background: ${target.isVerified ? '#f0fdf4' : '#fffbeb'}; padding: 10px 14px; border-radius: 6px; border: 1px solid ${target.isVerified ? '#bbf7d0' : '#fde68a'};">
            <strong>Verification Notice:</strong> ${target.verificationNotice}
          </div>
        </div>

        <!-- Detected Metadata Overview Grid -->
        ${data.isDailySummary ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Report Type</div>
              <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top: 4px;">
                Amazon Business Report
              </div>
              <div style="font-size: 11px; color: #059669; font-weight: 600; margin-top: 2px;">
                Aggregate Daily Metrics
              </div>
            </div>

            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Date Range & Days</div>
              <div style="font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-top: 4px;">
                ${data.dateRange ? `${data.dateRange.startDate} to ${data.dateRange.endDate}` : 'N/A'}
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${data.validRowsCount} Daily Summary Rows
              </div>
            </div>

            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Gross Ordered Sales</div>
              <div style="font-size: 16px; font-weight: 800; color: #059669; margin-top: 4px;">
                ${fInr(data.totalGrossSales || 0)}
              </div>
              <div style="font-size: 11px; color: #6366f1; font-weight: 600; margin-top: 2px;">
                B2B Sales: ${fInr(data.totalB2bSales || 0)}
              </div>
            </div>

            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Aggregate Volume</div>
              <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 4px;">
                ${(data.totalUnitsOrdered || 0).toLocaleString('en-IN')} Units Ordered
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${(data.totalOrderItems || 0).toLocaleString('en-IN')} Order Items (Not Unique Orders)
              </div>
            </div>

            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Traffic & Conversion</div>
              <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 4px;">
                ${(data.totalSessions || 0).toLocaleString('en-IN')} Sessions
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                Across 30 calendar days
              </div>
            </div>
          </div>

          <!-- Explanation Banner for Daily Summary -->
          <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; color: #166534; font-size: 12.5px; line-height: 1.5;">
            <strong>ℹ️ Amazon Daily Business Report:</strong> This file contains daily aggregate performance and traffic summaries.
            Sales and units are aggregated daily totals (no individual customer order IDs exist in this report).
            B2B metrics are preserved separately. Zero fake orders will be generated, and records will be stored safely as daily summaries without modifying the individual-order ledger.
          </div>
        ` : `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px;">
            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Detected Marketplace</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-top: 4px;">
                ${data.detectedMarketplace ? data.detectedMarketplace.toUpperCase() : '<span style="color: #b45309;">Not Detected (Generic)</span>'}
              </div>
            </div>

            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Detected Seller Account</div>
              <div style="font-size: 14px; font-weight: 700; color: ${data.detectedAccount ? '#059669' : '#b45309'}; margin-top: 4px;">
                ${data.detectedAccount ? `✓ ${data.detectedAccount.accountName}` : '⚠️ Manual Selection Required'}
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${data.detectedAccount ? `Matched via ${data.detectedAccount.matchField}` : 'No verified seller ID found in file'}
              </div>
            </div>

            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Report Date Range</div>
              <div style="font-size: 14px; font-weight: 700; color: var(--text-main); margin-top: 4px;">
                ${data.dateRange ? `${data.dateRange.startDate} to ${data.dateRange.endDate}` : 'Single Day / Current Date'}
              </div>
            </div>

            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 6px; padding: 14px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Valid Records Extracted</div>
              <div style="font-size: 16px; font-weight: 800; color: #059669; margin-top: 4px;">
                ${data.validRowsCount} Orders
              </div>
            </div>
          </div>
        `}

        <!-- Parsing Warnings (if any) -->
        ${data.warnings && data.warnings.length > 0 ? `
          <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 700; color: #b45309; margin-bottom: 6px;">
              ⚠️ Parsing Notices (${data.warnings.length}):
            </div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: var(--text-muted); max-height: 90px; overflow-y: auto;">
              ${data.warnings.map(w => `<li>${w}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Validation Error Banner (Blocks Import if 0 rows) -->
        ${data.validRowsCount === 0 ? `
          <div style="background: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px; padding: 18px 20px; margin-bottom: 20px; color: #92400e;">
            <div style="font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span>⚠️</span> 0 Valid Records Found — Import Disabled
            </div>
            <div style="font-size: 13px; line-height: 1.5;">
              ${data.validationError || 'This report contains 0 valid records.'}
            </div>
          </div>
        ` : ''}

        <!-- Preview Table -->
        <div style="margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
            ${data.isDailySummary
              ? `Preview of Daily Business Summaries (${data.validRowsCount} Days Extracted from ${data.totalRows} file rows)`
              : `Preview of Extracted Sales Rows (${data.validRowsCount} Orders Extracted from ${data.totalRows} file rows)`}
          </div>
          ${data.validRowsCount === 0 ? `
            <div style="background: #f8fafc; border: 1.5px dashed var(--border-color); border-radius: 8px; padding: 32px 20px; text-align: center; color: var(--text-muted);">
              <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
              <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">Zero Valid Records Extracted</div>
              <div style="font-size: 12.5px; max-width: 520px; margin: 0 auto; line-height: 1.5;">
                No valid records could be extracted from this report file.
              </div>
            </div>
          ` : data.isDailySummary ? `
            <div class="data-table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Report Date</th>
                    <th class="text-right">Gross Sales</th>
                    <th class="text-right">B2B Sales</th>
                    <th class="text-right">Units Ordered</th>
                    <th class="text-right">Total Order Items</th>
                    <th class="text-right">Sessions</th>
                    <th>Session %</th>
                    <th class="text-right">Avg Selling Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.previewDailyRows || []).map(row => `
                    <tr>
                      <td><code>${row.reportDate}</code></td>
                      <td class="text-right" style="font-weight: 700; color: #047857;">${fInr(row.grossOrderedSales)}</td>
                      <td class="text-right" style="color: #4338ca; font-weight: 600;">${fInr(row.b2bOrderedSales)}</td>
                      <td class="text-right">${row.unitsOrdered}</td>
                      <td class="text-right">${row.totalOrderItems}</td>
                      <td class="text-right">${row.totalSessions ? row.totalSessions.toLocaleString('en-IN') : 0}</td>
                      <td><span style="font-size: 11px; color: var(--text-muted);">${row.orderItemSessionPercentage || '-'}</span></td>
                      <td class="text-right" style="font-weight: 600;">${fInr(row.avgSellingPrice)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="data-table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Order Date</th>
                    <th>Raw Status</th>
                    <th>Normalized Status</th>
                    <th class="text-right">Gross Amount</th>
                    <th class="text-right">Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.previewRows.map(row => `
                    <tr>
                      <td><code>${row.orderId}</code></td>
                      <td>${row.orderDate}</td>
                      <td><span style="font-size: 11px; color: var(--text-muted);">${row.rawStatus}</span></td>
                      <td>
                        <span class="badge-status ${row.status.toLowerCase()}">${row.status}</span>
                      </td>
                      <td class="text-right" style="font-weight: 700;">${fInr(row.grossAmount)}</td>
                      <td class="text-right" style="font-weight: 700; color: #059669;">${fInr(row.netAmount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- Confirmation Action Card -->
        <div id="previewConfirmationCard" style="background: ${data.validRowsCount === 0 ? '#f8fafc' : '#f0fdf4'}; border: 1.5px solid ${data.validRowsCount === 0 ? 'var(--border-color)' : '#86efac'}; border-radius: 8px; padding: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: ${data.validRowsCount === 0 ? 'var(--text-main)' : '#166534'};" id="confirmTargetTitle">
              Confirm Ingestion into ${target.accountName ? `'${target.accountName}' (${target.platformName})` : 'Cartman Database'}
            </div>
            <div style="font-size: 12px; color: ${data.validRowsCount === 0 ? 'var(--text-muted)' : '#15803d'}; margin-top: 3px;" id="confirmTargetSubtitle">
              ${data.hasConflict ? 'Import is currently disabled due to detection conflict.' : (data.validRowsCount === 0 ? 'Import is disabled because 0 records were found in this report.' : (!target.accountId ? 'Please select a seller account above to enable import.' : (data.isDailySummary ? `Click confirm to persist ${data.validRowsCount} daily summary records for '${target.accountName}'. Existing duplicate dates will be skipped automatically.` : `Click confirm to persist ${data.validRowsCount} validated sales orders. Duplicate order IDs will be skipped automatically.`)))}
            </div>
          </div>
          <button id="btnConfirmImport" style="background: ${data.validRowsCount === 0 ? '#94a3b8' : '#059669'}; color: #ffffff; border: none; padding: 12px 24px; border-radius: 6px; font-size: 13.5px; font-weight: 700; transition: background 0.2s ease; ${(data.hasConflict || !target.accountId || data.validRowsCount === 0) ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;'}" ${(data.hasConflict || !target.accountId || data.validRowsCount === 0) ? 'disabled' : ''}>
            ${data.validRowsCount === 0 ? '🚫 Cannot Import (0 Records Extracted)' : (data.isDailySummary ? `✓ Confirm & Import Daily Summaries into ${target.accountName || 'Account'} (${target.platformName})` : `✓ Confirm & Import into ${target.accountName || 'Account'} (${target.platformName})`)}
          </button>
        </div>
      </div>
    `;

    previewContainer.style.display = 'block';

    const confirmBtn = previewContainer.querySelector('#btnConfirmImport');
    if (confirmBtn && !data.hasConflict && target.accountId && data.validRowsCount > 0) {
      confirmBtn.onclick = () => this.runImport(container);
    }
  },

  async runImport(container) {
    if (window.isDemoMode) {
      API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
      return;
    }
    const confirmBtn = container.querySelector('#btnConfirmImport');
    const selectAcc = container.querySelector('#selectAccount');
    const selectMkt = container.querySelector('#selectMarketplace');
    const previewContainer = container.querySelector('#previewContainer');
    const fInr = (v) => API.formatInr(v);

    if (!this.previewData || this.previewData.validRowsCount === 0) {
      API.toast('No valid records to import from this report.', 'error');
      return;
    }

    const target = this.getTargetDetails(container);
    const chosenAccountId = target.accountId;

    if (!chosenAccountId) {
      API.toast('Please select a target seller account from the dropdown before confirming import.', 'error');
      if (selectAcc) selectAcc.focus();
      return;
    }

    confirmBtn.textContent = '⏳ Ingesting & Deduplicating...';
    confirmBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('reportFile', this.selectedFile);
      formData.append('accountId', chosenAccountId);
      if (selectMkt.value) formData.append('marketplace', selectMkt.value);

      const res = await API.salesReport.import(formData);

      if (res.isDailySummary) {
        previewContainer.innerHTML = `
          <div style="background: #ffffff; border: 1.5px solid #10b981; border-radius: 8px; padding: 32px 24px; text-align: center; margin-top: 24px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);">
            <div style="font-size: 44px; margin-bottom: 12px;">📊</div>
            <div style="font-size: 18px; font-weight: 800; color: #065f46; margin-bottom: 8px;">
              Amazon Daily Business Report Successfully Ingested!
            </div>
            <div style="font-size: 13.5px; color: var(--text-main); max-width: 580px; margin: 0 auto 16px auto;">
              ${res.message}
            </div>
            <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;">
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: #166534;">
                Days Imported: <strong>${res.importedCount}</strong> (${res.skippedDuplicatesCount} duplicates skipped)
              </div>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: #166534;">
                Gross Sales: <strong>${fInr(res.totalGrossSales)}</strong>
              </div>
              <div style="background: #eef2ff; border: 1px solid #c7d2fe; padding: 8px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: #3730a3;">
                B2B Sales: <strong>${fInr(res.totalB2bSales)}</strong> (Preserved Separately)
              </div>
              <div style="background: #f8fafc; border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--text-main);">
                Volume: <strong>${res.totalUnitsOrdered} Units</strong> • <strong>${res.totalOrderItems} Order Items</strong>
              </div>
            </div>
            <div style="display: flex; justify-content: center; gap: 14px;">
              <button id="btnUploadAnother" style="background: #ffffff; border: 1.5px solid var(--border-color); color: var(--text-main); padding: 9px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                📤 Upload Another Report
              </button>
              <button id="btnGoToDashboard" style="background: #059669; border: none; color: #ffffff; padding: 9px 22px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer;">
                📊 View in Dashboard
              </button>
            </div>
          </div>
        `;
        API.toast('Daily business summaries imported successfully!', 'success');
      } else {
        previewContainer.innerHTML = `
          <div style="background: #ffffff; border: 1.5px solid #10b981; border-radius: 8px; padding: 32px 24px; text-align: center; margin-top: 24px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);">
            <div style="font-size: 44px; margin-bottom: 12px;">🎉</div>
            <div style="font-size: 18px; font-weight: 800; color: #065f46; margin-bottom: 8px;">
              Sales Report Successfully Ingested!
            </div>
            <div style="font-size: 13.5px; color: var(--text-main); max-width: 500px; margin: 0 auto 16px auto;">
              ${res.message}
            </div>
            <div style="display: inline-flex; gap: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 20px; border-radius: 20px; font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 24px;">
              <span>Imported: <strong>${res.importedCount}</strong></span>
              <span>•</span>
              <span>Duplicates Skipped: <strong>${res.skippedDuplicatesCount}</strong></span>
            </div>
            <div style="display: flex; justify-content: center; gap: 14px;">
              <button id="btnUploadAnother" style="background: #ffffff; border: 1.5px solid var(--border-color); color: var(--text-main); padding: 9px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                📤 Upload Another Report
              </button>
              <button id="btnGoToDashboard" style="background: #059669; border: none; color: #ffffff; padding: 9px 22px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer;">
                📊 View in Dashboard
              </button>
            </div>
          </div>
        `;
        API.toast('Sales orders imported successfully!', 'success');
      }

      container.querySelector('#btnUploadAnother').onclick = () => {
        this.render(container);
      };

      container.querySelector('#btnGoToDashboard').onclick = () => {
        window.AppState.setActiveView('dashboard');
      };
    } catch (err) {
      API.toast(err.message, 'error');
      confirmBtn.textContent = this.previewData.isDailySummary ? `✓ Confirm & Import Daily Summaries` : `✓ Confirm & Import Orders`;
      confirmBtn.disabled = false;
    }
  }
};

window.SalesReportUploadView = SalesReportUploadView;
