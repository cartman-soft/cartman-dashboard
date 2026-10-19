/**
 * Bank Statement Import View Component
 * Provides:
 * 1. Drag & drop .xlsx / .csv statement upload
 * 2. Supported bank column profiles (HDFC, ICICI, SBI, Axis, Kotak, Standard)
 * 3. Pre-import preview, validation, and column mapping adjustment
 * 4. Duplicate statement & transaction prevention
 * 5. Downloadable sample bank templates (.csv and .xlsx)
 * 6. Historical statement log
 */

const BankImportView = {
  selectedFile: null,
  previewData: null,

  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Loading statement import engine...</div>
      </div>
    `;

    try {
      const [profilesRes, stmtsRes] = await Promise.all([
        API.bank.getProfiles(),
        API.bank.getStatements()
      ]);

      const profiles = profilesRes.profiles || [];
      const statements = stmtsRes.data || [];
      const fInr = (v) => API.formatInr(v);

      container.innerHTML = `
        <div class="section-header">
          <div>
            <div class="section-title">Bank Statement Ingestion Engine</div>
            <div style="font-size: 12px; color: var(--text-muted);">Import official bank statements (.xlsx / .csv) for automated settlement reconciliation</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="/api/bank/template/csv" class="btn-secondary" download style="text-decoration: none;">
              📥 Sample CSV Template
            </a>
            <a href="/api/bank/template/xlsx" class="btn-secondary" download style="text-decoration: none;">
              📥 Sample XLSX Template
            </a>
          </div>
        </div>

        ${window.isDemoMode ? `
          <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; color: #92400e;">
            <span style="font-size: 24px;">🔒</span>
            <div>
              <div style="font-weight: 700; font-size: 13.5px;">Disabled in Public Demo</div>
              <div style="font-size: 12px; margin-top: 2px;">Bank statement imports are locked in the public demo. Pre-seeded sample reconciliation and ledger records are active.</div>
            </div>
          </div>
        ` : ''}

        <!-- Statement Upload & Mapping Card -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 24px; margin-bottom: 28px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div class="form-group">
              <label class="form-label">Target Bank Account Name *</label>
              <input type="text" class="form-control" id="targetBankName" placeholder="e.g. HDFC Bank Corporate Current A/C (..4902)" value="HDFC Corporate Current A/C">
            </div>

            <div class="form-group">
              <label class="form-label">Bank Format / Profile *</label>
              <select class="form-control" id="bankProfileSelect">
                ${profiles.map(p => `
                  <option value="${p.key}">${p.name}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- Drag and Drop Zone -->
          <div class="dropzone" id="fileDropzone">
            <input type="file" id="statementFileInput" accept=".xlsx,.xls,.csv" style="display: none;">
            <div class="dropzone-icon">📁</div>
            <div class="dropzone-text" id="dropzoneText">Drag and drop bank statement (.xlsx, .xls, .csv) here or browse</div>
            <div class="dropzone-sub">Supports HDFC, ICICI, SBI, Axis, Kotak, and Standard Cartman formats up to 20MB</div>
          </div>

          <!-- File Selected Preview Action -->
          <div id="previewControlsArea" style="display: none; margin-top: 16px; align-items: center; justify-content: space-between;">
            <div id="selectedFileInfo" style="font-size: 13px; font-weight: 600; color: #fff;"></div>
            <button class="btn-primary" id="btnPreviewStatement">
              🔍 Inspect & Preview Statement
            </button>
          </div>
        </div>

        <!-- Preview Modal / Area (Hidden until inspected) -->
        <div id="previewInspectionArea" style="display: none; margin-bottom: 28px;"></div>

        <!-- 2. Statement Upload History -->
        <div class="section-header">
          <div class="section-title">Statement Import History (${statements.length} Uploads)</div>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Statement File</th>
                <th>Bank Account</th>
                <th>Statement Period</th>
                <th class="text-right">Total Rows</th>
                <th class="text-right">Total Credits</th>
                <th class="text-right">Total Debits</th>
                <th>Imported By</th>
                <th>Uploaded At</th>
              </tr>
            </thead>
            <tbody>
              ${statements.length === 0 ? `
                <tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 24px;">No statements imported yet. Upload a statement to get started.</td></tr>
              ` : statements.map(st => `
                <tr>
                  <td><strong>${st.originalFilename}</strong></td>
                  <td>${st.bankName}</td>
                  <td>${st.statementPeriod || '—'}</td>
                  <td class="text-right"><strong>${st.totalRecords}</strong></td>
                  <td class="text-right" style="color: #38bdf8; font-weight: 700;">${fInr(st.totalCredits)}</td>
                  <td class="text-right" style="color: #f87171;">${fInr(st.totalDebits)}</td>
                  <td>${st.uploadedBy}</td>
                  <td style="font-size: 11px; color: var(--text-dim);">${new Date(st.createdAt).toLocaleString('en-IN')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      this.bindEvents(container);
    } catch (err) {
      container.innerHTML = `<div class="callout-box warning">Failed to load bank import view: ${err.message}</div>`;
    }
  },

  bindEvents(container) {
    const dropzone = container.querySelector('#fileDropzone');
    const fileInput = container.querySelector('#statementFileInput');
    const previewControls = container.querySelector('#previewControlsArea');
    const fileInfo = container.querySelector('#selectedFileInfo');
    const btnPreview = container.querySelector('#btnPreviewStatement');

    dropzone.addEventListener('click', () => {
      if (window.isDemoMode) {
        API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
        return;
      }
      fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (window.isDemoMode) return;
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (window.isDemoMode) {
        API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
        return;
      }
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileSelected(e.dataTransfer.files[0], previewControls, fileInfo);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        this.handleFileSelected(fileInput.files[0], previewControls, fileInfo);
      }
    });

    btnPreview.addEventListener('click', () => {
      this.runInspection(container);
    });
  },

  handleFileSelected(file, previewControls, fileInfo) {
    this.selectedFile = file;
    const sizeKb = Math.round(file.size / 1024);
    fileInfo.innerHTML = `📄 <strong>${file.name}</strong> (${sizeKb} KB)`;
    previewControls.style.display = 'flex';
  },

  async runInspection(container) {
    if (!this.selectedFile) return;

    const inspectionArea = container.querySelector('#previewInspectionArea');
    inspectionArea.style.display = 'block';
    inspectionArea.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 24px; text-align: center; color: var(--text-muted);">
        ⏳ Inspecting statement columns and validating date formats...
      </div>
    `;

    const formData = new FormData();
    formData.append('statementFile', this.selectedFile);

    try {
      const res = await API.bank.previewStatement(formData);
      this.previewData = res;

      const fInr = (v) => API.formatInr(v);

      inspectionArea.innerHTML = `
        <div style="background: var(--bg-card); border: 2px solid var(--primary); border-radius: var(--radius-md); padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div>
              <div style="font-size: 16px; font-weight: 700; color: #fff;">File Validation & Column Normalization Preview</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Sheet: <strong>${res.sheetName}</strong> • Total Rows: <strong>${res.totalRows}</strong> • Detected Bank Format: <strong style="color: var(--primary); text-transform: uppercase;">${res.detectedProfile}</strong>
              </div>
            </div>
            <button class="btn-primary" id="btnConfirmImport" style="background: #10b981;">
              ✅ Confirm & Ingest Statement
            </button>
          </div>

          ${res.isDuplicateFile ? `
            <div class="callout-box warning" style="border-left-color: var(--danger);">
              <span>⚠️</span>
              <div>
                <strong>DUPLICATE STATEMENT FILE DETECTED:</strong> This exact file checksum matches Statement #${res.existingStatementId} already in the database.
                Re-importing is blocked to guarantee financial integrity and prevent double-counting.
              </div>
            </div>
          ` : ''}

          <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">
            Sample Normalized Preview (Top ${res.previewRows.length} Rows):
          </div>

          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Row #</th>
                  <th>Date</th>
                  <th>Description / Narration</th>
                  <th>Reference / UTR</th>
                  <th class="text-right">Credit (Deposit)</th>
                  <th class="text-right">Debit</th>
                  <th class="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                ${res.previewRows.map(r => `
                  <tr>
                    <td>${r.rowNumber}</td>
                    <td><strong>${r.transactionDate}</strong></td>
                    <td style="max-width: 250px; font-size: 12px;">${r.description}</td>
                    <td><code>${r.utrNo || r.referenceNo || '—'}</code></td>
                    <td class="text-right" style="color: #38bdf8; font-weight: 700;">${fInr(r.creditAmount)}</td>
                    <td class="text-right" style="color: #f87171;">${fInr(r.debitAmount)}</td>
                    <td class="text-right">${fInr(r.balance)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Bind Confirm Button
      const btnConfirm = inspectionArea.querySelector('#btnConfirmImport');
      if (btnConfirm) {
        if (res.isDuplicateFile) {
          btnConfirm.disabled = true;
          btnConfirm.style.opacity = '0.5';
          btnConfirm.title = 'Duplicate file cannot be re-imported';
        } else {
          btnConfirm.addEventListener('click', () => this.executeFinalImport(container));
        }
      }
    } catch (err) {
      inspectionArea.innerHTML = `
        <div class="callout-box warning" style="border-left-color: var(--danger);">
          <span>❌</span>
          <div>
            <strong>Validation Error:</strong> ${err.message}<br>
            Please ensure your file has valid Date and Credit/Deposit columns, or download our sample templates.
          </div>
        </div>
      `;
    }
  },

  async executeFinalImport(container) {
    if (window.isDemoMode) {
      API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
      return;
    }
    const btn = container.querySelector('#btnConfirmImport');
    btn.textContent = '⏳ Ingesting & Running Auto-Reconciliation...';
    btn.disabled = true;

    const bankName = container.querySelector('#targetBankName').value;
    const profileKey = container.querySelector('#bankProfileSelect').value;

    const formData = new FormData();
    formData.append('statementFile', this.selectedFile);
    formData.append('bankName', bankName);
    formData.append('profileKey', profileKey);

    try {
      const res = await API.bank.importStatement(formData);
      API.toast(res.message, 'success');
      API.toast(`Auto-reconciliation matched ${res.autoMatchedCount} settlements!`, 'info');
      this.render(container);
    } catch (err) {
      API.toast(err.message, 'error');
      btn.textContent = '✅ Confirm & Ingest Statement';
      btn.disabled = false;
    }
  }
};
