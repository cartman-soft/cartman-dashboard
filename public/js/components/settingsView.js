/**
 * Settings & Audit View Component
 * Provides company settings, formula reference manual, and security audit log review.
 */

const SettingsView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Loading system configurations and audit records...</div>
      </div>
    `;

    try {
      const auditRes = await API.integrations.getAuditLogs().catch(() => ({ data: [] }));
      const auditLogs = auditRes.data || [];

      container.innerHTML = `
        <div class="section-header">
          <div>
            <div class="section-title">System Settings & Governance</div>
            <div style="font-size: 12px; color: var(--text-muted);">Company configurations, mathematical definitions, and security audit trail</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px;">
          <!-- 1. Company Information Card -->
          <div class="metric-card" style="padding: 24px;">
            <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 16px;">🏢 Company Profile</div>
            <div class="form-group">
              <label class="form-label">Company Name</label>
              <input type="text" class="form-control" value="Cartman" readonly>
            </div>
            <div class="form-group">
              <label class="form-label">Operating Currency</label>
              <input type="text" class="form-control" value="Indian Rupee (INR - ₹)" readonly>
            </div>
            <div class="form-group">
              <label class="form-label">Automatic Sync Scheduler</label>
              <input type="text" class="form-control" value="Every 15 Minutes (Active)" readonly>
            </div>
          </div>

          <!-- 2. Calculation Rules & Policy Manual -->
          <div class="metric-card" style="padding: 24px;">
            <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 16px;">📐 Financial Calculation Rules</div>
            <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px;">
              <div>
                <strong style="color: #fff;">Gross Sales:</strong><br>
                <code>SUM(Item Price × Qty + Shipping Fees + Taxes Charged)</code> before any cancellation or return deductions.
              </div>
              <div>
                <strong style="color: #34d399;">Net Sales:</strong><br>
                <code>Gross Sales - Valid Cancellations - Customer Returns - Deduplicated Refunds</code>.<br>
                Cancellations and refunds are never deducted twice.
              </div>
              <div>
                <strong style="color: #fbbf24;">Sales-vs-Received Gap:</strong><br>
                <code>Net Sales - Verified Bank Receipts (for period)</code>.<br>
                Reflects cash flow timing lag and payout delivery reserves (T+7 to T+15).
              </div>
              <div>
                <strong style="color: #f87171;">Actual Settlement Pending:</strong><br>
                <code>SUM(Marketplace Settlement batches with Status = Pending / On-Hold)</code>.<br>
                Never assumed to be Sales minus Bank Receipts.
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Audit Trail Table -->
        <div class="section-header">
          <div class="section-title">Audit Trail & Security Log (${auditLogs.length} Events)</div>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User ID</th>
                <th>Action Performed</th>
                <th>Entity Type</th>
                <th>Target Entity ID</th>
                <th>Event Metadata</th>
              </tr>
            </thead>
            <tbody>
              ${auditLogs.length === 0 ? `
                <tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 24px;">No audit events recorded yet.</td></tr>
              ` : auditLogs.map(log => `
                <tr>
                  <td style="font-size: 11.5px; white-space: nowrap;">${new Date(log.createdAt).toLocaleString('en-IN')}</td>
                  <td><code>${log.userId.substring(0, 8)}...</code></td>
                  <td><span class="role-pill admin">${log.action}</span></td>
                  <td><span style="font-size: 11px; text-transform: uppercase; color: var(--text-muted);">${log.entityType}</span></td>
                  <td><code>${log.entityId ? log.entityId.substring(0, 8) + '...' : '—'}</code></td>
                  <td style="font-size: 11px; color: var(--text-dim); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${log.detailsJson || '{}'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="callout-box warning">Failed to load settings: ${err.message}</div>`;
    }
  }
};
