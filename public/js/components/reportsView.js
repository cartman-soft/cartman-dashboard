/**
 * Reports & Exports View Component
 * Provides downloads in Excel (.xlsx), CSV (.csv), and printable PDF formats
 * across company totals, marketplace totals, account totals, and settlement reconciliation.
 */

const ReportsView = {
  render(container) {
    const filter = window.AppState.getFilterParams();

    container.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Reports & Financial Exports</div>
          <div style="font-size: 12px; color: var(--text-muted);">Generate and download official financial reconciliation statements in XLSX, CSV, or PDF format</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 28px;">
        <!-- Card 1: Multi-Sheet Excel Workbook -->
        <div class="metric-card" style="padding: 24px; border-top: 3px solid #10b981;">
          <div style="font-size: 32px; margin-bottom: 12px;">📊</div>
          <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">Master Financial Workbook (.xlsx)</div>
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 20px;">
            Includes 5 structured sheets: Company Grand Totals, Marketplace Breakdown, Seller Accounts, Settlement Reconciliation, and Bank Transactions Ledger.
          </div>
          <button class="btn-primary" id="btnDownloadMasterExcel" style="width: 100%; justify-content: center; background: #10b981;">
            📥 Download Master Excel (.xlsx)
          </button>
        </div>

        <!-- Card 2: PDF / Printable Official Statement -->
        <div class="metric-card" style="padding: 24px; border-top: 3px solid #3b82f6;">
          <div style="font-size: 32px; margin-bottom: 12px;">📑</div>
          <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">Printable Statement / PDF (.pdf)</div>
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 20px;">
            High-fidelity printable statement with official Cartman letterhead, audit metadata, reconciliation notes, and approval signature sections.
          </div>
          <button class="btn-primary" id="btnOpenPrintableReport" style="width: 100%; justify-content: center; background: #3b82f6;">
            🖨️ View & Print / Save as PDF
          </button>
        </div>

        <!-- Card 3: CSV Dimension Exports -->
        <div class="metric-card" style="padding: 24px; border-top: 3px solid #8b5cf6;">
          <div style="font-size: 32px; margin-bottom: 12px;">📁</div>
          <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">Specific Dimension CSV Export</div>
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px;">
            Export raw tabular records formatted for accounting software import (Tally, Zoho Books, QuickBooks).
          </div>
          <div class="form-group" style="margin-bottom: 12px;">
            <select class="form-control" id="selectCsvDimension">
              <option value="overview">Company Overview Totals</option>
              <option value="marketplaces">Marketplace-Wise Totals</option>
              <option value="accounts">Seller Account Breakdown</option>
              <option value="settlements">Settlements Ledger</option>
              <option value="bank_transactions">Bank Transactions Ledger</option>
            </select>
          </div>
          <button class="btn-primary" id="btnDownloadCsv" style="width: 100%; justify-content: center; background: #8b5cf6;">
            📥 Download CSV
          </button>
        </div>
      </div>

      <!-- Scope & Active Date Filter Notice -->
      <div class="callout-box">
        <span style="font-size: 16px;">ℹ️</span>
        <div>
          <strong>Export Scope:</strong> All generated reports strictly respect your active period filter:
          <strong>${filter.period.toUpperCase()}</strong>
          ${filter.period === 'daily' ? `(${filter.date})` : filter.period === 'monthly' ? `(${filter.month})` : `(${filter.startDate} to ${filter.endDate})`}
          and data mode (<strong>${window.AppState.get('includeDemo') ? 'Demo + Connected Accounts' : 'Real Imported Accounts Only'}</strong>).
        </div>
      </div>
    `;

    this.bindEvents(container);
  },

  bindEvents(container) {
    // Download Master Excel
    container.querySelector('#btnDownloadMasterExcel').onclick = () => {
      const params = window.AppState.getFilterParams();
      window.open(API.reports.getExcelUrl(params), '_blank');
    };

    // Open Printable Report
    container.querySelector('#btnOpenPrintableReport').onclick = () => {
      const params = window.AppState.getFilterParams();
      window.open(API.reports.getPrintUrl(params), '_blank');
    };

    // Download CSV
    container.querySelector('#btnDownloadCsv').onclick = () => {
      const params = window.AppState.getFilterParams();
      const dimension = container.querySelector('#selectCsvDimension').value;
      window.open(API.reports.getCsvUrl({ ...params, dimension }), '_blank');
    };
  }
};
