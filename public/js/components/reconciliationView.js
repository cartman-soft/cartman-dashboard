/**
 * Payment Reconciliation View Component
 * Core financial reconciliation module tracking:
 * 1. Sales-vs-Received Gap vs Actual Settlement Pending
 * 2. Settlement statements ledger (IDs, fees, refunds, net payouts, status)
 * 3. Multi-tier automated matching with bank deposits
 * 4. Manual reconciliation pair/unpair overrides
 */

const ReconciliationView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Executing payment reconciliation analysis...</div>
      </div>
    `;

    try {
      const res = await API.reconciliation.getSummary();
      const { totals, settlements, transactions } = res.data;
      const fInr = (v) => API.formatInr(v);

      container.innerHTML = `
        ${window.isDemoMode ? `
          <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; color: #92400e;">
            <span style="font-size: 24px;">🔒</span>
            <div>
              <div style="font-weight: 700; font-size: 13.5px;">Disabled in Public Demo</div>
              <div style="font-size: 12px; margin-top: 2px;">Automated reconciliation matching, manual pair/unpair overrides, and ledger changes are locked in the public demo.</div>
            </div>
          </div>
        ` : ''}

        <div class="section-header">
          <div>
            <div class="section-title">Payment & Settlement Reconciliation</div>
            <div style="font-size: 12px; color: var(--text-muted);">Compare marketplace disbursement obligations against verified bank receipts</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" id="btnExportReconExcel">
              📊 Export to Excel (.xlsx)
            </button>
            <button class="btn-primary" id="btnRunReconcile" ${window.isDemoMode ? 'style="opacity: 0.6; cursor: not-allowed;"' : ''}>
              ${window.isDemoMode ? '🔒 Run Matching (Demo Locked)' : '⚡ Run Automated Matching'}
            </button>
          </div>
        </div>

        <!-- 1. High-Level Reconciliation Metrics -->
        <div class="totals-grid">
          <div class="metric-card accent-settle">
            <div class="metric-header">
              <span class="metric-title">Disbursed Settlements</span>
              <span class="metric-icon">📑</span>
            </div>
            <div class="metric-value">${fInr(totals.totalSettlementsDisbursed)}</div>
            <div class="metric-sub">${totals.counts.totalSettlements} settlement statement batches</div>
          </div>

          <div class="metric-card accent-bank">
            <div class="metric-header">
              <span class="metric-title">Matched Bank Receipts</span>
              <span class="metric-icon">🏦</span>
            </div>
            <div class="metric-value" style="color: #38bdf8;">${fInr(totals.matchedBankAmount)}</div>
            <div class="metric-sub">${totals.counts.matched} matched deposits</div>
          </div>

          <div class="metric-card accent-pending">
            <div class="metric-header">
              <span class="metric-title">Actual Settlement Pending</span>
              <span class="metric-icon">⚠️</span>
            </div>
            <div class="metric-value" style="color: #f87171;">${fInr(totals.actualSettlementPending)}</div>
            <div class="metric-sub">${fInr(totals.totalSettlementsPending)} pending + ${fInr(totals.totalSettlementsOnHold)} on hold</div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-title">Unmatched Bank Credits</span>
              <span class="metric-icon">🔍</span>
            </div>
            <div class="metric-value" style="color: #fb923c;">${fInr(totals.unmatchedBankAmount)}</div>
            <div class="metric-sub">${totals.counts.unmatched} unallocated transactions</div>
          </div>
        </div>

        <!-- 2. Critical Accounting Disparity Callout -->
        <div class="callout-box warning">
          <span style="font-size: 20px;">⚖️</span>
          <div>
            <strong>Core Principle of Marketplace Accounting:</strong><br>
            <strong>Actual Settlement Pending</strong> is calculated strictly from marketplace settlement accounts receivable balance (Net Payable = ${fInr(totals.actualSettlementPending)}).
            It is <strong>NEVER</strong> assumed to equal Sales minus Bank Receipts. Sales-vs-Received variances include delivery confirmation lags, return safety reserves, and courier transit periods.
          </div>
        </div>

        <!-- 3. Marketplace Settlements Ledger -->
        <div class="section-header" style="margin-top: 24px;">
          <div class="section-title">Marketplace Settlement Statements & Bank Matching</div>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Settlement ID & Date</th>
                <th>Marketplace & Account</th>
                <th class="text-right">Gross Sales</th>
                <th class="text-right">Marketplace Fees</th>
                <th class="text-right">Net Payout</th>
                <th>Status</th>
                <th>Bank UTR / Ref</th>
                <th>Bank Match Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${settlements.map(st => {
                const totalFees = (st.commissionFee || 0) + (st.fixedFee || 0) + (st.shippingFee || 0) + (st.taxes || 0);
                return `
                  <tr>
                    <td>
                      <div style="font-weight: 700; color: #fff;">${st.settlementId}</div>
                      <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
                        Date: ${st.settlementDate}
                      </div>
                    </td>
                    <td>
                      <div><strong>${st.accountName}</strong></div>
                      <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted);">${st.marketplace}</div>
                    </td>
                    <td class="text-right">${fInr(st.grossSales)}</td>
                    <td class="text-right" style="color: #f87171;">-${fInr(totalFees)}</td>
                    <td class="text-right" style="font-weight: 800; color: #34d399;">${fInr(st.netPayout)}</td>
                    <td>
                      <span class="badge-status ${st.status}">${st.status}</span>
                    </td>
                    <td>
                      <code>${st.bankRefId || '—'}</code>
                    </td>
                    <td>
                      ${st.isReconciled ? `
                        <span class="badge-status matched">Matched (${st.matchedBankTx.matchType})</span>
                        <div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">
                          Tx Date: ${st.matchedBankTx.transactionDate}
                        </div>
                      ` : `
                        <span class="badge-status unmatched">Pending Bank Receipt</span>
                      `}
                    </td>
                    <td>
                      ${st.isReconciled ? `
                        <button class="btn-secondary btn-unmatch-tx" data-id="${st.matchedBankTx.id}" style="padding: 3px 8px; font-size: 11px; color: var(--danger);">
                          Unlink
                        </button>
                      ` : `
                        <button class="btn-secondary btn-manual-link" data-stid="${st.id}" style="padding: 3px 8px; font-size: 11px;">
                          Link Tx
                        </button>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- 4. Bank Statement Receipts Ledger -->
        <div class="section-header" style="margin-top: 28px;">
          <div class="section-title">Imported Bank Statement Credits (${transactions.length} Transactions)</div>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Narration / Description</th>
                <th>UTR / Ref Number</th>
                <th class="text-right">Deposit (Credit)</th>
                <th>Reconciliation Status</th>
                <th>Matched Settlement Batch</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map(tx => `
                <tr>
                  <td style="white-space: nowrap;">${tx.transactionDate}</td>
                  <td>
                    <div style="font-size: 12.5px; color: #fff; max-width: 320px;">${tx.description}</div>
                    ${tx.notes ? `<div style="font-size: 10.5px; color: var(--text-dim); margin-top: 2px;">${tx.notes}</div>` : ''}
                  </td>
                  <td><code>${tx.utrNo || tx.referenceNo || '—'}</code></td>
                  <td class="text-right" style="font-weight: 700; color: #38bdf8;">${fInr(tx.creditAmount)}</td>
                  <td>
                    <span class="badge-status ${tx.reconciliationStatus}">
                      ${tx.reconciliationStatus}
                    </span>
                  </td>
                  <td>
                    ${tx.matchedSettlement ? `
                      <div><strong>${tx.matchedSettlement.settlementId}</strong></div>
                      <div style="font-size: 11px; color: var(--text-dim);">${tx.matchedSettlement.marketplace.toUpperCase()} • ${fInr(tx.matchedSettlement.netPayout)}</div>
                    ` : `
                      <span style="color: var(--text-dim); font-size: 11px;">No batch linked</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      this.bindEvents(container);
    } catch (err) {
      container.innerHTML = `<div class="callout-box warning">Failed to load reconciliation data: ${err.message}</div>`;
    }
  },

  bindEvents(container) {
    // Run automated reconciliation
    const runBtn = container.querySelector('#btnRunReconcile');
    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        runBtn.textContent = '⏳ Matching...';
        runBtn.disabled = true;
        try {
          const res = await API.reconciliation.run();
          API.toast(`Reconciliation finished! Newly matched ${res.newlyMatchedCount} transactions.`, 'success');
          this.render(container);
        } catch (e) {
          API.toast(e.message, 'error');
          runBtn.textContent = '⚡ Run Automated Matching';
          runBtn.disabled = false;
        }
      });
    }

    // Export Excel
    const expBtn = container.querySelector('#btnExportReconExcel');
    if (expBtn) {
      expBtn.addEventListener('click', () => {
        const filterParams = window.AppState.getFilterParams();
        window.open(API.reports.getExcelUrl(filterParams), '_blank');
      });
    }

    // Unlink button
    container.querySelectorAll('.btn-unmatch-tx').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (window.isDemoMode) {
          API.toast('Disabled in Public Demo: File uploads, imports, account edits, and data-changing actions are locked in demo mode.', 'error');
          return;
        }
        const txId = btn.getAttribute('data-id');
        if (!confirm('Are you sure you want to unlink this bank transaction?')) return;
        try {
          await API.reconciliation.unmatch(txId);
          API.toast('Transaction unlinked successfully.', 'info');
          this.render(container);
        } catch (e) {
          API.toast(e.message, 'error');
        }
      });
    });

    // Manual link button
    container.querySelectorAll('.btn-manual-link').forEach(btn => {
      btn.addEventListener('click', async () => {
        const stId = btn.getAttribute('data-stid');
        this.showManualLinkModal(stId);
      });
    });
  },

  async showManualLinkModal(settlementId) {
    const res = await API.reconciliation.getSummary();
    const unmatched = res.data.transactions.filter(t => t.reconciliationStatus === 'unmatched');

    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');

    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">Manually Link Settlement with Bank Receipt</div>
        <button class="btn-close-modal" id="btnCloseModal">✕</button>
      </div>
      <div class="modal-body">
        ${unmatched.length === 0 ? `
          <div style="color: var(--text-muted); padding: 20px 0; text-align: center;">
            No unmatched bank transactions are currently available to link.
          </div>
        ` : `
          <div class="form-group">
            <label class="form-label">Select Unmatched Bank Credit *</label>
            <select class="form-control" id="selectBankTx">
              ${unmatched.map(tx => `
                <option value="${tx.id}">
                  ${tx.transactionDate} | ${API.formatInr(tx.creditAmount)} | ${tx.utrNo || tx.referenceNo || 'No UTR'} (${tx.description.substring(0, 30)})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Reconciliation Note</label>
            <input type="text" class="form-control" id="reconNote" placeholder="e.g. Verified via Axis NetBanking UTR confirmation" value="Manually verified and linked by Accounts">
          </div>
        `}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="btnCancelModal">Cancel</button>
        ${unmatched.length > 0 ? `<button class="btn-primary" id="btnSubmitLink">Confirm Link</button>` : ''}
      </div>
    `;

    modal.classList.add('active');
    const closeModal = () => modal.classList.remove('active');
    card.querySelector('#btnCloseModal').onclick = closeModal;
    card.querySelector('#btnCancelModal').onclick = closeModal;

    const submitBtn = card.querySelector('#btnSubmitLink');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const txId = card.querySelector('#selectBankTx').value;
        const note = card.querySelector('#reconNote').value;
        try {
          await API.reconciliation.match(txId, settlementId, note);
          API.toast('Settlement matched to bank receipt!', 'success');
          closeModal();
          ReconciliationView.render(document.getElementById('viewContainer'));
        } catch (e) {
          API.toast(e.message, 'error');
        }
      };
    }
  }
};
