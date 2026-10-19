/**
 * Order Summary View Component
 * Provides aggregate order counts across the standard lifecycle:
 * [New, Processing, Shipped, Delivered, Cancelled, Returned]
 * Broken down by Company, Marketplace, and Individual Seller Account.
 */

const OrdersView = {
  async render(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div>Compiling multi-marketplace order summaries...</div>
      </div>
    `;

    try {
      const filterParams = window.AppState.getFilterParams();
      const res = await API.orders.getSummary(filterParams);
      const { companyStatusCounts, totalOrders, marketplaceBreakdown, accountBreakdown, statusLegend, periodInfo } = res;

      const statuses = ['New', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];

      container.innerHTML = `
        <div class="section-header">
          <div>
            <div class="section-title">Order Summary & Status Mapping (${periodInfo.label})</div>
            <div style="font-size: 12px; color: var(--text-muted);">Unified order lifecycle mapping across Amazon, Flipkart, Meesho, and Blinkit</div>
          </div>
        </div>

        <!-- 1. Company Status Breakdown Counters -->
        <div class="totals-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
          ${statuses.map(st => {
            const count = companyStatusCounts[st] || 0;
            const pct = totalOrders ? ((count / totalOrders) * 100).toFixed(1) : 0;
            const colors = {
              New: '#3b82f6',
              Processing: '#f59e0b',
              Shipped: '#8b5cf6',
              Delivered: '#10b981',
              Cancelled: '#ef4444',
              Returned: '#ec4899'
            };
            return `
              <div class="metric-card" style="border-top: 3px solid ${colors[st]};">
                <div class="metric-header">
                  <span class="metric-title">${st}</span>
                  <span class="badge-status ${st.toLowerCase()}">${pct}%</span>
                </div>
                <div class="metric-value">${count}</div>
                <div class="metric-sub">${st} Orders</div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 2. Marketplace-Wise Status Breakdown Table -->
        <div class="section-header" style="margin-top: 24px;">
          <div class="section-title">Marketplace Order Distributions</div>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Marketplace</th>
                <th class="text-right">Total Orders</th>
                <th class="text-right">New</th>
                <th class="text-right">Processing</th>
                <th class="text-right">Shipped</th>
                <th class="text-right">Delivered</th>
                <th class="text-right">Cancelled</th>
                <th class="text-right">Returned</th>
              </tr>
            </thead>
            <tbody>
              ${marketplaceBreakdown.map(m => `
                <tr>
                  <td><strong>${m.displayName}</strong></td>
                  <td class="text-right" style="font-weight: 700; color: #fff;">${m.totalOrders}</td>
                  <td class="text-right">${m.statusCounts.New || 0}</td>
                  <td class="text-right">${m.statusCounts.Processing || 0}</td>
                  <td class="text-right">${m.statusCounts.Shipped || 0}</td>
                  <td class="text-right" style="color: #34d399; font-weight: 600;">${m.statusCounts.Delivered || 0}</td>
                  <td class="text-right" style="color: #f87171;">${m.statusCounts.Cancelled || 0}</td>
                  <td class="text-right" style="color: #fbbf24;">${m.statusCounts.Returned || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 3. Seller Account-Wise Status Breakdown Table -->
        <div class="section-header" style="margin-top: 24px;">
          <div class="section-title">Seller Account Drill-Down</div>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Marketplace</th>
                <th class="text-right">Total Orders</th>
                <th class="text-right">New</th>
                <th class="text-right">Processing</th>
                <th class="text-right">Shipped</th>
                <th class="text-right">Delivered</th>
                <th class="text-right">Cancelled</th>
                <th class="text-right">Returned</th>
              </tr>
            </thead>
            <tbody>
              ${accountBreakdown.map(acc => `
                <tr>
                  <td>
                    <strong>${acc.accountName}</strong>
                    ${acc.isDemo ? '<span class="badge-status duplicate" style="margin-left: 6px; font-size: 9px; padding: 1px 5px;">DEMO DATA</span>' : '<span class="badge-status connected" style="margin-left: 6px; font-size: 9px; padding: 1px 5px;">LIVE</span>'}
                  </td>
                  <td><span style="text-transform: uppercase; font-size: 11px; color: var(--text-muted);">${acc.marketplace}</span></td>
                  <td class="text-right" style="font-weight: 700;">${acc.totalOrders}</td>
                  <td class="text-right">${acc.statusCounts.New || 0}</td>
                  <td class="text-right">${acc.statusCounts.Processing || 0}</td>
                  <td class="text-right">${acc.statusCounts.Shipped || 0}</td>
                  <td class="text-right" style="color: #34d399;">${acc.statusCounts.Delivered || 0}</td>
                  <td class="text-right" style="color: #f87171;">${acc.statusCounts.Cancelled || 0}</td>
                  <td class="text-right" style="color: #fbbf24;">${acc.statusCounts.Returned || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 4. Status Normalization & Legend -->
        <div class="callout-box" style="margin-top: 24px;">
          <span style="font-size: 16px;">📖</span>
          <div>
            <strong>Status Normalization Rules:</strong><br>
            ${statusLegend.map(item => `
              • <strong>${item.status}</strong>: ${item.description}<br>
            `).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="callout-box warning">Failed to load order summary: ${err.message}</div>`;
    }
  }
};
