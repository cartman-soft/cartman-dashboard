/**
 * Dashboard View Component
 * Renders:
 * 1. Company Grand Totals (10 Core Metrics in INR)
 * 2. Visual Sales & Settlement Trend Chart
 * 3. Individual Marketplace Cards (Amazon, Flipkart, Meesho, Blinkit) with Seller Account Drilldowns
 * 4. Accounting Explanation Callout (Sales Gap vs Settlement Pending)
 */

const DashboardView = {
  async render(container) {
    let salesAmount = '₹0.00';
    let hasSalesData = false;
    let ordersCount = 0;
    let hasOrderData = false;
    let deliveredCount = 0;
    let shippedCount = 0;
    let outstandingAmount = '₹0.00';
    let hasOutstandingData = false;
    let inventoryValue = '₹0.00';
    let hasInventoryData = false;
    let inventoryStatusMsg = 'Inventory valuation data unavailable';
    let periodLabel = '';

    // Platform breakdown definitions for Total Sales flip card (Amazon, Flipkart, Meesho, Blinkit)
    const platformDefs = [
      {
        key: 'amazon',
        name: 'Amazon',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#232f3e;flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 15c4 3 12 3 16 0" stroke="#FF9900" stroke-width="2.5" stroke-linecap="round"/><path d="M17.5 13.5l2.5 1.5-1.5 2.5" fill="#FF9900"/><text x="6" y="12" fill="#FFFFFF" font-size="11" font-weight="900" font-family="Arial, sans-serif">a</text></svg></span>`
      },
      {
        key: 'flipkart',
        name: 'Flipkart',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#2874f0;flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 7h12l-1.5 13h-9L6 7z" fill="#FFFFFF"/><path d="M9 7V4.5a2.5 2.5 0 015 0V7" stroke="#FFFFFF" stroke-width="2"/><text x="9.5" y="16" fill="#2874f0" font-size="11" font-weight="900" font-style="italic" font-family="Arial, sans-serif">f</text></svg></span>`
      },
      {
        key: 'meesho',
        name: 'Meesho',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#9b2c89;flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 18V8.5a2 2 0 014 0v5a2 2 0 004 0v-5a2 2 0 014 0V18" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
      },
      {
        key: 'blinkit',
        name: 'Blinkit',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#f8cb46;flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><text x="6" y="17" fill="#0c831f" font-size="16" font-weight="900" font-family="Arial, sans-serif">b</text></svg></span>`
      }
    ];

    // Platform Sales rows
    let platformRows = platformDefs.map(d => ({
      name: d.name,
      key: d.key,
      logoSvg: d.logoSvg,
      amountFormatted: 'Sales data unavailable',
      hasData: false
    }));
    let platformTotalDisplay = 'Sales data unavailable';
    let isPartial = false;

    // Platform Orders rows
    let platformOrdersRows = platformDefs.map(d => ({
      name: d.name,
      key: d.key,
      logoSvg: d.logoSvg,
      countFormatted: 'Data unavailable',
      hasData: false
    }));
    let platformOrdersTotalDisplay = 'Data unavailable';
    let isOrdersPartial = false;

    // Platform Outstanding Settlements rows
    let platformPaymentsRows = platformDefs.map(d => ({
      name: d.name,
      key: d.key,
      logoSvg: d.logoSvg,
      amountFormatted: 'Data unavailable',
      hasData: false
    }));
    let platformPaymentsTotalDisplay = 'Data unavailable';
    let isPaymentsPartial = false;

    // Platform Warehouse Inventory rows
    const whLabels = {
      amazon: 'Amazon FBA / WH',
      flipkart: 'Flipkart FC / WH',
      meesho: 'Meesho Location',
      blinkit: 'Blinkit Dark Store'
    };
    let platformInventoryRows = platformDefs.map(d => ({
      name: d.name,
      whName: whLabels[d.key] || d.name,
      logoSvg: d.logoSvg,
      valueFormatted: 'Inventory value unavailable',
      hasData: false
    }));
    let platformInventoryTotalDisplay = 'Inventory value unavailable';

    try {
      const filterParams = window.AppState ? window.AppState.getFilterParams() : { period: 'monthly' };
      const overviewRes = await API.dashboard.getOverview(filterParams);
      const data = overviewRes && overviewRes.data;
      if (data && data.periodInfo) {
        periodLabel = data.periodInfo.label || '';
      }
      if (data && data.grandTotals) {
        const gt = data.grandTotals;
        if (typeof gt.grossSales === 'number' && gt.grossSales > 0) {
          salesAmount = API.formatInr(gt.grossSales);
          hasSalesData = true;
        }
        if (typeof gt.totalOrders === 'number' && gt.totalOrders > 0) {
          ordersCount = gt.totalOrders;
          hasOrderData = true;
          deliveredCount = (gt.statusCounts && gt.statusCounts.Delivered) || 0;
          shippedCount = (gt.statusCounts && gt.statusCounts.Shipped) || 0;
        }
        if (typeof gt.actualSettlementPending === 'number' && gt.actualSettlementPending > 0) {
          outstandingAmount = API.formatInr(gt.actualSettlementPending);
          hasOutstandingData = true;
        }
      }

      // 1. Platform Sales breakdown calculation
      let platformSalesSum = 0;
      let platformsWithDataCount = 0;
      const computedPlatformRows = [];

      // 2. Platform Orders breakdown calculation
      let platformOrdersSum = 0;
      let platformsWithOrderDataCount = 0;
      const computedOrderRows = [];

      // 3. Platform Outstanding Settlements breakdown calculation
      let platformPaymentsSum = 0;
      let platformsWithPaymentDataCount = 0;
      const computedPaymentRows = [];

      for (const def of platformDefs) {
        let mktObj = null;
        if (data && Array.isArray(data.marketplaces)) {
          mktObj = data.marketplaces.find(m =>
            (m.key && m.key.toLowerCase() === def.key) ||
            (m.displayName && m.displayName.toLowerCase() === def.key)
          );
        }

        // Sales
        if (mktObj && typeof mktObj.grossSales === 'number') {
          platformsWithDataCount++;
          platformSalesSum += mktObj.grossSales;
          computedPlatformRows.push({
            name: def.name,
            key: def.key,
            logoSvg: def.logoSvg,
            amountFormatted: API.formatInr(mktObj.grossSales),
            hasData: true
          });
        } else {
          computedPlatformRows.push({
            name: def.name,
            key: def.key,
            logoSvg: def.logoSvg,
            amountFormatted: 'Sales data unavailable',
            hasData: false
          });
        }

        // Orders
        if (mktObj && typeof mktObj.totalOrders === 'number') {
          platformsWithOrderDataCount++;
          platformOrdersSum += mktObj.totalOrders;
          computedOrderRows.push({
            name: def.name,
            key: def.key,
            logoSvg: def.logoSvg,
            countFormatted: `${mktObj.totalOrders} Orders`,
            hasData: true
          });
        } else {
          computedOrderRows.push({
            name: def.name,
            key: def.key,
            logoSvg: def.logoSvg,
            countFormatted: 'Data unavailable',
            hasData: false
          });
        }

        // Outstanding Settlements (strictly pending reports, not sales)
        if (mktObj && typeof mktObj.settlementPending === 'number') {
          platformsWithPaymentDataCount++;
          platformPaymentsSum += mktObj.settlementPending;
          computedPaymentRows.push({
            name: def.name,
            key: def.key,
            logoSvg: def.logoSvg,
            amountFormatted: API.formatInr(mktObj.settlementPending),
            hasData: true
          });
        } else {
          computedPaymentRows.push({
            name: def.name,
            key: def.key,
            logoSvg: def.logoSvg,
            amountFormatted: 'Data unavailable',
            hasData: false
          });
        }
      }

      // Sales Totals
      if (platformsWithDataCount > 0) {
        platformRows = computedPlatformRows;
        const allPlatformsPresent = platformsWithDataCount === platformDefs.length;
        if (allPlatformsPresent) {
          platformTotalDisplay = API.formatInr(platformSalesSum);
        } else {
          isPartial = true;
          platformTotalDisplay = `${API.formatInr(platformSalesSum)} (Partial data)`;
        }
      } else {
        platformRows = computedPlatformRows;
        platformTotalDisplay = 'Sales data unavailable';
      }

      // Orders Totals
      if (platformsWithOrderDataCount > 0) {
        platformOrdersRows = computedOrderRows;
        const allOrderPlatformsPresent = platformsWithOrderDataCount === platformDefs.length;
        if (allOrderPlatformsPresent) {
          platformOrdersTotalDisplay = `${platformOrdersSum} Orders`;
        } else {
          isOrdersPartial = true;
          platformOrdersTotalDisplay = `${platformOrdersSum} Orders (Partial data)`;
        }
      } else {
        platformOrdersRows = computedOrderRows;
        platformOrdersTotalDisplay = 'Data unavailable';
      }

      // Payments Totals
      if (platformsWithPaymentDataCount > 0) {
        platformPaymentsRows = computedPaymentRows;
        const allPaymentPlatformsPresent = platformsWithPaymentDataCount === platformDefs.length;
        if (allPaymentPlatformsPresent) {
          platformPaymentsTotalDisplay = API.formatInr(platformPaymentsSum);
        } else {
          isPaymentsPartial = true;
          platformPaymentsTotalDisplay = `${API.formatInr(platformPaymentsSum)} (Partial data)`;
        }
      } else {
        platformPaymentsRows = computedPaymentRows;
        platformPaymentsTotalDisplay = 'Data unavailable';
      }

      // 4. Platform Inventory Value breakdown calculation
      // Value = available stock quantity * verified per-unit cost.
      // Unit cost or required data missing => "Inventory value unavailable".
      // Selling price must not be used as cost price.
      const invList = (data && Array.isArray(data.inventory)) ? data.inventory : [];
      let totalInventoryValuationSum = 0;
      let hasAnyWarehouseData = false;
      const computedInventoryRows = [];

      for (const def of platformDefs) {
        const platformItems = invList.filter(item =>
          item && (
            (item.warehouse && item.warehouse.toLowerCase().includes(def.key)) ||
            (item.platform && item.platform.toLowerCase() === def.key)
          )
        );

        if (platformItems.length > 0) {
          let pVal = 0;
          let hasValidCost = true;
          for (const it of platformItems) {
            const q = Number(it.stockQuantity);
            const c = Number(it.costPrice); // verified unit cost only, never sellingPrice
            if (isNaN(q) || q < 0 || isNaN(c) || c <= 0) {
              hasValidCost = false;
              break;
            }
            pVal += (q * c);
          }

          if (hasValidCost) {
            hasAnyWarehouseData = true;
            totalInventoryValuationSum += pVal;
            computedInventoryRows.push({
              name: def.name,
              whName: whLabels[def.key] || def.name,
              logoSvg: def.logoSvg,
              valueFormatted: API.formatInr(pVal),
              hasData: true
            });
          } else {
            computedInventoryRows.push({
              name: def.name,
              whName: whLabels[def.key] || def.name,
              logoSvg: def.logoSvg,
              valueFormatted: 'Inventory value unavailable',
              hasData: false
            });
          }
        } else {
          computedInventoryRows.push({
            name: def.name,
            whName: whLabels[def.key] || def.name,
            logoSvg: def.logoSvg,
            valueFormatted: 'Inventory value unavailable',
            hasData: false
          });
        }
      }

      platformInventoryRows = computedInventoryRows;
      platformInventoryTotalDisplay = hasAnyWarehouseData ? API.formatInr(totalInventoryValuationSum) : 'Inventory value unavailable';


      // Inventory Valuation Calculation Logic
      // Total Inventory Value = SUM(available stock quantity * per-unit inventory cost)
      // Never use selling price as cost price.
      // Incomplete data (e.g. stock exists but cost missing) is not silently treated as zero-cost.
      if (data && data.inventory && Array.isArray(data.inventory) && data.inventory.length > 0) {
        let totalValuation = 0;
        let hasMissingCost = false;
        let validItemsCount = 0;

        for (const item of data.inventory) {
          const qty = Number(item.stockQuantity);
          const cost = Number(item.costPrice); // per-unit inventory valuation cost

          if (isNaN(cost) || cost === null || cost === undefined || cost <= 0) {
            hasMissingCost = true;
          } else if (!isNaN(qty) && qty > 0) {
            totalValuation += (qty * cost);
            validItemsCount++;
          }
        }

        if (hasMissingCost && validItemsCount === 0) {
          inventoryValue = '₹0.00';
          hasInventoryData = false;
          inventoryStatusMsg = 'Incomplete data: cost price missing';
        } else if (validItemsCount > 0) {
          inventoryValue = API.formatInr(totalValuation);
          hasInventoryData = true;
          inventoryStatusMsg = hasMissingCost ? 'Partial valuation (some costs missing)' : 'Total stock value across company';
        } else {
          inventoryValue = '₹0.00';
          hasInventoryData = false;
          inventoryStatusMsg = 'Inventory valuation data unavailable';
        }
      } else {
        // Existing data model does not contain inventory valuation records
        inventoryValue = '₹0.00';
        hasInventoryData = false;
        inventoryStatusMsg = 'Inventory valuation data unavailable';
      }
    } catch (e) {
      console.warn('[DashboardView] Could not retrieve financial figures:', e.message);
    }

    container.innerHTML = `
      <div style="background: #ffffff; border: 1px solid var(--border-color); border-top: 3px solid var(--primary); border-radius: var(--radius-md); padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);">
          <div>
            <h1 style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">Dashboard Overview</h1>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Cartman Sales & Payments Analytics Workspace</p>
          </div>
          <span style="display: inline-flex; align-items: center; gap: 6px; background: var(--primary-light); color: #059669; border: 1px solid var(--primary-border); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
            System Active
          </span>
        </div>

        <!-- Metrics Row: Total Sales, Total Orders, Total Outstanding Payments & Total Inventory Value -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px;">
          <!-- Total Sales Interactive 3D Flip Card (Flips on hover for desktop, tap on mobile) -->
          <div class="sales-flip-card" id="salesFlipCard" tabindex="0" role="button" aria-expanded="false" aria-label="Total Sales: ${salesAmount}. Hover on desktop or tap on mobile to view platform sales breakdown.">
            <div class="sales-flip-card-inner">
              <!-- Front Side: Total Sales -->
              <div class="sales-flip-card-front">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Sales</span>
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: var(--primary-light); color: #059669; border: 1px solid var(--primary-border); padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600;" title="Hover card to flip">
                      <span style="font-size: 11px;">🔄</span> Hover
                    </span>
                  </div>
                  <span style="width: 32px; height: 32px; border-radius: 8px; background: var(--primary-light); color: #059669; display: flex; align-items: center; justify-content: center; font-size: 16px;">📈</span>
                </div>
                <div style="font-size: 26px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; margin-bottom: 10px;">
                  ${salesAmount}
                </div>
                <div style="font-size: 12px; color: ${hasSalesData ? 'var(--text-dim)' : '#b45309'}; display: flex; align-items: center; justify-content: space-between;">
                  <span style="display: flex; align-items: center; gap: 5px;">
                    ${hasSalesData ? `Gross sales for ${periodLabel}` : `<span>⚠️</span> No sales data available`}
                  </span>
                  <span style="font-size: 11px; color: #059669; font-weight: 500;">Hover for platforms ➔</span>
                </div>
              </div>

              <!-- Back Side: 2-Column Platform Sales Breakdown (Amazon, Flipkart, Meesho, Blinkit) -->
              <div class="sales-flip-card-back">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; margin-bottom: 5px;">
                  <span style="font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span>📊</span> Platform Breakdown
                  </span>
                  <span style="font-size: 10px; color: var(--text-muted); font-weight: 500;">
                    4 Platforms
                  </span>
                </div>

                <!-- 2-Column Grid: Left (Amazon, Meesho) | Right (Flipkart, Blinkit) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; align-content: center;">
                  ${platformRows.map(p => `
                    <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 5px 8px; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
                        ${p.logoSvg}
                        <span style="font-weight: 600; color: var(--text-main); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</span>
                      </div>
                      <div style="font-weight: 700; color: ${p.hasData ? '#0f172a' : '#b45309'}; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.amountFormatted}">
                        ${p.amountFormatted}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Total Orders Interactive 3D Flip Card (Flips on hover for desktop, tap on mobile) -->
          <div class="sales-flip-card" id="ordersFlipCard" tabindex="0" role="button" aria-expanded="false" aria-label="Total Orders: ${ordersCount}. Hover on desktop or tap on mobile to view platform order counts.">
            <div class="sales-flip-card-inner">
              <!-- Front Side: Total Orders -->
              <div class="sales-flip-card-front">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Orders</span>
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: var(--primary-light); color: #059669; border: 1px solid var(--primary-border); padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600;" title="Hover card to flip">
                      <span style="font-size: 11px;">🔄</span> Hover
                    </span>
                  </div>
                  <span style="width: 32px; height: 32px; border-radius: 8px; background: var(--primary-light); color: #059669; display: flex; align-items: center; justify-content: center; font-size: 16px;">📦</span>
                </div>
                <div style="font-size: 26px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; margin-bottom: 10px;">
                  ${ordersCount}
                </div>
                <div style="font-size: 12px; color: ${hasOrderData ? 'var(--text-dim)' : '#b45309'}; display: flex; align-items: center; justify-content: space-between;">
                  <span style="display: flex; align-items: center; gap: 5px;">
                    ${hasOrderData ? `${deliveredCount} Delivered • ${shippedCount} Shipped` : `<span>⚠️</span> No order data available`}
                  </span>
                  <span style="font-size: 11px; color: #059669; font-weight: 500;">Hover for platforms ➔</span>
                </div>
              </div>

              <!-- Back Side: 2-Column Platform Orders Breakdown (Amazon, Flipkart, Meesho, Blinkit) -->
              <div class="sales-flip-card-back">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; margin-bottom: 5px;">
                  <span style="font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span>📊</span> Platform Orders
                  </span>
                  <span style="font-size: 10px; color: var(--text-muted); font-weight: 500;">
                    4 Platforms
                  </span>
                </div>

                <!-- 2-Column Grid: Left (Amazon, Meesho) | Right (Flipkart, Blinkit) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; align-content: center;">
                  ${platformOrdersRows.map(p => `
                    <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 5px 8px; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
                        ${p.logoSvg}
                        <span style="font-weight: 600; color: var(--text-main); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</span>
                      </div>
                      <div style="font-weight: 700; color: ${p.hasData ? '#0f172a' : '#b45309'}; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.countFormatted}">
                        ${p.countFormatted}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Total Outstanding Payments Interactive 3D Flip Card (Flips on hover for desktop, tap on mobile) -->
          <div class="sales-flip-card" id="paymentsFlipCard" tabindex="0" role="button" aria-expanded="false" aria-label="Total Outstanding Payments: ${outstandingAmount}. Hover on desktop or tap on mobile to view platform pending settlements.">
            <div class="sales-flip-card-inner">
              <!-- Front Side: Total Outstanding Payments -->
              <div class="sales-flip-card-front">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Outstanding Payments</span>
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: var(--primary-light); color: #059669; border: 1px solid var(--primary-border); padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600;" title="Hover card to flip">
                      <span style="font-size: 11px;">🔄</span> Hover
                    </span>
                  </div>
                  <span style="width: 32px; height: 32px; border-radius: 8px; background: var(--primary-light); color: #059669; display: flex; align-items: center; justify-content: center; font-size: 16px;">💳</span>
                </div>
                <div style="font-size: 26px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; margin-bottom: 10px;">
                  ${outstandingAmount}
                </div>
                <div style="font-size: 12px; color: ${hasOutstandingData ? 'var(--text-dim)' : '#b45309'}; display: flex; align-items: center; justify-content: space-between;">
                  <span style="display: flex; align-items: center; gap: 5px;">
                    ${hasOutstandingData ? 'Pending across all platforms' : `<span>⚠️</span> No outstanding payment data available`}
                  </span>
                  <span style="font-size: 11px; color: #059669; font-weight: 500;">Hover for platforms ➔</span>
                </div>
              </div>

              <!-- Back Side: 2-Column Platform Settlements Breakdown (Amazon, Flipkart, Meesho, Blinkit) -->
              <div class="sales-flip-card-back">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; margin-bottom: 5px;">
                  <span style="font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span>📊</span> Platform Settlements
                  </span>
                  <span style="font-size: 10px; color: var(--text-muted); font-weight: 500;">
                    Pending Payouts
                  </span>
                </div>

                <!-- 2-Column Grid: Left (Amazon, Meesho) | Right (Flipkart, Blinkit) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; align-content: center;">
                  ${platformPaymentsRows.map(p => `
                    <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 5px 8px; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
                        ${p.logoSvg}
                        <span style="font-weight: 600; color: var(--text-main); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</span>
                      </div>
                      <div style="font-weight: 700; color: ${p.hasData ? '#0f172a' : '#b45309'}; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.amountFormatted}">
                        ${p.amountFormatted}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Total Inventory Value Interactive 3D Flip Card (Flips on hover for desktop, tap on mobile) -->
          <div class="sales-flip-card" id="inventoryFlipCard" tabindex="0" role="button" aria-expanded="false" aria-label="Total Inventory Value: ${inventoryValue}. Hover on desktop or tap on mobile to view platform inventory values.">
            <div class="sales-flip-card-inner">
              <!-- Front Side: Total Inventory Value -->
              <div class="sales-flip-card-front">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Inventory Value</span>
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: var(--primary-light); color: #059669; border: 1px solid var(--primary-border); padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600;" title="Hover card to flip">
                      <span style="font-size: 11px;">🔄</span> Hover
                    </span>
                  </div>
                  <span style="width: 32px; height: 32px; border-radius: 8px; background: var(--primary-light); color: #059669; display: flex; align-items: center; justify-content: center; font-size: 16px;">🏷️</span>
                </div>
                <div style="font-size: 26px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; margin-bottom: 10px;">
                  ${inventoryValue}
                </div>
                <div style="font-size: 12px; color: ${hasInventoryData ? 'var(--text-dim)' : '#b45309'}; display: flex; align-items: center; justify-content: space-between;">
                  <span style="display: flex; align-items: center; gap: 5px;">
                    ${hasInventoryData ? 'Total stock value across company' : `<span>⚠️</span> ${inventoryStatusMsg}`}
                  </span>
                  <span style="font-size: 11px; color: #059669; font-weight: 500;">Hover for platforms ➔</span>
                </div>
              </div>

              <!-- Back Side: 2-Column Platform Inventory Value Breakdown (Amazon, Flipkart, Meesho, Blinkit) -->
              <div class="sales-flip-card-back">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; margin-bottom: 5px;">
                  <span style="font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span>📊</span> Platform Inventory
                  </span>
                  <span style="font-size: 10px; color: var(--text-muted); font-weight: 500;">
                    4 Platforms
                  </span>
                </div>

                <!-- 2-Column Grid: Left (Amazon, Meesho) | Right (Flipkart, Blinkit) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; align-content: center;">
                  ${platformInventoryRows.map(p => `
                    <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 5px 8px; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
                        ${p.logoSvg}
                        <span style="font-weight: 600; color: var(--text-main); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</span>
                      </div>
                      <div style="font-weight: 700; color: ${p.hasData ? '#0f172a' : '#b45309'}; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.valueFormatted}">
                        ${p.valueFormatted}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindFlipCard(container);
  },

  // Preserved for future steps:
  async renderFullDashboard(container) {
    try {
      const filterParams = window.AppState.getFilterParams();
      const overviewRes = await API.dashboard.getOverview(filterParams);
      const data = overviewRes.data;
      const gt = data.grandTotals;
      const fInr = (val) => API.formatInr(val);

      let html = `
          <!-- Gross Sales -->
          <div class="metric-card accent-gross" title="Total invoice value of all placed customer orders including shipping and taxes before cancellations.">
            <div class="metric-header">
              <span class="metric-title">Gross Sales</span>
              <span class="metric-icon">📈</span>
            </div>
            <div class="metric-value">${fInr(gt.grossSales)}</div>
            <div class="metric-sub">Total customer order value</div>
          </div>

          <!-- Net Sales -->
          <div class="metric-card accent-net" title="Gross Sales minus deduplicated cancellations, customer returns, and refunds.">
            <div class="metric-header">
              <span class="metric-title">Net Sales</span>
              <span class="metric-icon">💎</span>
            </div>
            <div class="metric-value" style="color: #34d399;">${fInr(gt.netSales)}</div>
            <div class="metric-sub">After cancellations & returns</div>
          </div>

          <!-- Total Orders -->
          <div class="metric-card" title="Total count of customer orders received across all marketplaces.">
            <div class="metric-header">
              <span class="metric-title">Total Orders</span>
              <span class="metric-icon">📦</span>
            </div>
            <div class="metric-value">${gt.totalOrders}</div>
            <div class="metric-sub">${gt.statusCounts.Delivered || 0} Delivered • ${gt.statusCounts.Shipped || 0} Shipped</div>
          </div>

          <!-- Cancelled Orders -->
          <div class="metric-card" title="Orders cancelled prior to dispatch.">
            <div class="metric-header">
              <span class="metric-title">Cancelled Orders</span>
              <span class="metric-icon">🚫</span>
            </div>
            <div class="metric-value" style="color: #f87171;">${gt.cancelledOrders}</div>
            <div class="metric-sub">${gt.totalOrders ? ((gt.cancelledOrders / gt.totalOrders) * 100).toFixed(1) : 0}% cancellation rate</div>
          </div>

          <!-- Returned Orders -->
          <div class="metric-card" title="Customer returns and RTOs (Return to Origin).">
            <div class="metric-header">
              <span class="metric-title">Returned Orders</span>
              <span class="metric-icon">↩️</span>
            </div>
            <div class="metric-value" style="color: #fbbf24;">${gt.returnedOrders}</div>
            <div class="metric-sub">${gt.totalOrders ? ((gt.returnedOrders / gt.totalOrders) * 100).toFixed(1) : 0}% return rate</div>
          </div>

          <!-- Total Marketplace Settlements -->
          <div class="metric-card accent-settle" title="Total net payout finalized & disbursed by marketplaces for the period.">
            <div class="metric-header">
              <span class="metric-title">Marketplace Settlements</span>
              <span class="metric-icon">📑</span>
            </div>
            <div class="metric-value">${fInr(gt.totalSettlements)}</div>
            <div class="metric-sub">Net disbursed payout batches</div>
          </div>

          <!-- Actual Bank Receipts -->
          <div class="metric-card accent-bank" title="Actual funds credited into Cartman bank accounts from marketplace remittances.">
            <div class="metric-header">
              <span class="metric-title">Actual Bank Receipts</span>
              <span class="metric-icon">🏦</span>
            </div>
            <div class="metric-value" style="color: #38bdf8;">${fInr(gt.actualBankReceipts)}</div>
            <div class="metric-sub">Verified bank credits received</div>
          </div>

          <!-- Sales-vs-Received Gap -->
          <div class="metric-card accent-gap" title="Net Sales minus Actual Bank Receipts for this timeframe. Driven by payout settlement cycles (T+7 to T+15).">
            <div class="metric-header">
              <span class="metric-title">Sales-vs-Received Gap</span>
              <span class="metric-icon">⏳</span>
            </div>
            <div class="metric-value" style="color: #fbbf24;">${fInr(gt.salesReceivedGap)}</div>
            <div class="metric-sub">Timing lag & payout buffer</div>
          </div>

          <!-- Actual Settlement Pending -->
          <div class="metric-card accent-pending" title="Outstanding net payable from pending/on-hold marketplace settlement statements. NOT equal to Sales minus Bank.">
            <div class="metric-header">
              <span class="metric-title">Settlement Pending</span>
              <span class="metric-icon">⚠️</span>
            </div>
            <div class="metric-value" style="color: #f87171;">${fInr(gt.actualSettlementPending)}</div>
            <div class="metric-sub">Marketplace obligation pending</div>
          </div>

          <!-- Unmatched Bank Transactions -->
          <div class="metric-card" title="Bank statement credits received that have not yet been reconciled to a marketplace payout batch.">
            <div class="metric-header">
              <span class="metric-title">Unmatched Bank Txns</span>
              <span class="metric-icon">🔍</span>
            </div>
            <div class="metric-value" style="color: #fb923c;">${gt.unmatchedBankTransactionsCount}</div>
            <div class="metric-sub">Unmatched: ${fInr(gt.unmatchedBankTransactionsAmount)}</div>
          </div>
        </div>

        <!-- Trend Chart Box -->
        <div class="chart-box">
          <div class="chart-header">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #fff;">14-Day Sales & Settlement Flow</div>
              <div style="font-size: 11.5px; color: var(--text-dim);">Daily Gross Sales vs Actual Bank Receipts</div>
            </div>
            <div class="chart-legend">
              <div class="legend-item">
                <span class="legend-dot" style="background: #3b82f6;"></span>
                <span>Gross Sales</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot" style="background: #10b981;"></span>
                <span>Net Sales</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot" style="background: #38bdf8;"></span>
                <span>Bank Receipts</span>
              </div>
            </div>
          </div>
          <div id="trendChartSvgContainer" style="width: 100%; height: 180px; position: relative;">
            <!-- Rendered by renderTrendChart() -->
          </div>
        </div>

        <!-- 2. Marketplace Performance Cards -->
        <div class="section-header">
          <div class="section-title">2. Marketplace Performance & Aggregation</div>
          <div style="font-size: 12px; color: var(--text-muted);">Aggregated across all connected seller accounts</div>
        </div>

        <div class="marketplace-cards-grid">
          ${data.marketplaces.map(m => this._renderMarketplaceCard(m)).join('')}
        </div>

        <!-- Accounting Policy Reference Note -->
        <div class="callout-box" style="margin-top: 12px;">
          <span style="font-size: 16px;">💡</span>
          <div>
            <strong>Reconciliation & Calculation Rules:</strong><br>
            • <em>Sales-vs-Received Gap</em> (${fInr(gt.salesReceivedGap)}): Measures cash latency between order confirmation and bank deposits due to marketplace payout cycles (Amazon: T+7, Flipkart: T+7 to 10, Meesho: T+7 to 15, Blinkit: bi-weekly).<br>
            • <em>Actual Settlement Pending</em> (${fInr(gt.actualSettlementPending)}): Strictly derived from unsettled marketplace statement line items (Pending/On-Hold). <u>Never assume Sales minus Bank Receipts equals pending settlements</u>.
          </div>
        </div>
      `;

      container.innerHTML = html;
      this.renderTrendChart();
      this.bindEvents(container);
    } catch (err) {
      container.innerHTML = `
        <div class="callout-box warning" style="border-left-color: var(--danger);">
          <span>❌</span>
          <div><strong>Failed to load dashboard data:</strong> ${err.message}</div>
        </div>
      `;
    }
  },

  _renderMarketplaceCard(m) {
    const fInr = (v) => API.formatInr(v);
    const mktColors = {
      amazon: '#ff9900',
      flipkart: '#2874f0',
      meesho: '#9b2c89',
      blinkit: '#0c831f'
    };
    const accentColor = mktColors[m.key] || '#3b82f6';

    return `
      <div class="marketplace-card" style="border-top: 3px solid ${accentColor};">
        <div class="mkt-card-header">
          <div class="mkt-brand">
            <div class="mkt-badge-logo ${m.key}">${m.displayName.substring(0, 1)}</div>
            <div>
              <div class="mkt-name">${m.displayName}</div>
              <div class="mkt-acc-count">${m.accounts.length} Connected Seller Account${m.accounts.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <span class="badge-status connected">Active</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div class="mkt-stat-row">
            <span class="mkt-stat-label">Gross Sales:</span>
            <span class="mkt-stat-val">${fInr(m.grossSales)}</span>
          </div>
          <div class="mkt-stat-row">
            <span class="mkt-stat-label">Net Sales:</span>
            <span class="mkt-stat-val positive">${fInr(m.netSales)}</span>
          </div>
          <div class="mkt-stat-row">
            <span class="mkt-stat-label">Total Orders:</span>
            <span class="mkt-stat-val">${m.totalOrders} <span style="font-size: 11px; font-weight: normal; color: var(--text-dim);">(${m.cancelledOrders} Canc / ${m.returnedOrders} Ret)</span></span>
          </div>
          <div class="mkt-stat-row">
            <span class="mkt-stat-label">Settlements Disbursed:</span>
            <span class="mkt-stat-val">${fInr(m.totalSettlements)}</span>
          </div>
          <div class="mkt-stat-row">
            <span class="mkt-stat-label">Bank Receipts:</span>
            <span class="mkt-stat-val" style="color: #38bdf8;">${fInr(m.bankReceipts)}</span>
          </div>
          <div class="mkt-stat-row">
            <span class="mkt-stat-label">Sales-vs-Received Gap:</span>
            <span class="mkt-stat-val warning">${fInr(m.salesReceivedGap)}</span>
          </div>
          <div class="mkt-stat-row" style="border-bottom: none;">
            <span class="mkt-stat-label">Settlement Pending:</span>
            <span class="mkt-stat-val danger">${fInr(m.settlementPending)}</span>
          </div>
        </div>

        <!-- Expandable Account Breakdown Drawer / Section -->
        <div class="mkt-accounts-drawer" id="drawer-${m.key}" style="display: none; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-subtle);">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Seller Accounts Breakdown:</div>
          ${m.accounts.map(acc => `
            <div style="background: var(--bg-sidebar); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 8px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <div>
                  <strong style="color: #fff;">${acc.accountName}</strong>
                  ${acc.isDemo ? '<span class="badge-status duplicate" style="margin-left: 6px; font-size: 9px; padding: 1px 5px;">DEMO DATA</span>' : '<span class="badge-status connected" style="margin-left: 6px; font-size: 9px; padding: 1px 5px;">LIVE</span>'}
                </div>
                <span class="badge-status ${acc.connectionStatus}">${acc.connectionStatus}</span>
              </div>
              <div style="color: var(--text-dim); font-size: 11px; margin-bottom: 6px;">ID: <code>${acc.sellerId}</code> • Last Sync: ${acc.lastSyncAt ? acc.lastSyncAt.split('T')[1].substring(0, 5) : 'Never'}</div>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; font-size: 11.5px;">
                <div>Gross: <strong>${fInr(acc.grossSales)}</strong></div>
                <div>Net: <strong style="color: #34d399;">${fInr(acc.netSales)}</strong></div>
                <div>Orders: <strong>${acc.totalOrders}</strong></div>
                <div>Pending: <strong style="color: #f87171;">${fInr(acc.settlementPending)}</strong></div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="mkt-card-footer">
          <button class="btn-expand-accounts" data-target="drawer-${m.key}">
            <span>View ${m.accounts.length} Seller Account${m.accounts.length !== 1 ? 's' : ''}</span>
            <span class="expand-arrow">▼</span>
          </button>
          <button class="btn-secondary" style="padding: 4px 10px; font-size: 11.5px;" onclick="window.AppState.setActiveView('accounts')">
            Manage
          </button>
        </div>
      </div>
    `;
  },

  async renderTrendChart() {
    const chartContainer = document.getElementById('trendChartSvgContainer');
    if (!chartContainer) return;

    try {
      const isDemo = window.AppState.get('includeDemo');
      const trendRes = await API.dashboard.getTrends(14, isDemo);
      const trends = trendRes.data || [];

      if (trends.length === 0) {
        chartContainer.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-dim);">No trend data available</div>`;
        return;
      }

      const width = chartContainer.clientWidth || 800;
      const height = 180;
      const padding = { top: 20, right: 20, bottom: 30, left: 60 };

      const maxVal = Math.max(...trends.map(t => Math.max(t.grossSales, t.bankReceipts)), 10000);
      const xScale = (i) => padding.left + (i / (trends.length - 1)) * (width - padding.left - padding.right);
      const yScale = (v) => height - padding.bottom - (v / maxVal) * (height - padding.top - padding.bottom);

      // SVG path for Gross Sales
      const grossPoints = trends.map((t, i) => `${xScale(i)},${yScale(t.grossSales)}`).join(' L ');
      // SVG path for Net Sales
      const netPoints = trends.map((t, i) => `${xScale(i)},${yScale(t.netSales)}`).join(' L ');
      // SVG path for Bank Receipts
      const bankPoints = trends.map((t, i) => `${xScale(i)},${yScale(t.bankReceipts)}`).join(' L ');

      const svgHtml = `
        <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
          <!-- Grid Lines -->
          <line x1="${padding.left}" y1="${yScale(maxVal * 0.25)}" x2="${width - padding.right}" y2="${yScale(maxVal * 0.25)}" stroke="#1e293b" stroke-dasharray="3,3" />
          <line x1="${padding.left}" y1="${yScale(maxVal * 0.5)}" x2="${width - padding.right}" y2="${yScale(maxVal * 0.5)}" stroke="#1e293b" stroke-dasharray="3,3" />
          <line x1="${padding.left}" y1="${yScale(maxVal * 0.75)}" x2="${width - padding.right}" y2="${yScale(maxVal * 0.75)}" stroke="#1e293b" stroke-dasharray="3,3" />
          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#334155" />

          <!-- Y-Axis Labels -->
          <text x="${padding.left - 8}" y="${yScale(maxVal)}" fill="#64748b" font-size="10" text-anchor="end">₹${Math.round(maxVal / 1000)}k</text>
          <text x="${padding.left - 8}" y="${yScale(maxVal * 0.5)}" fill="#64748b" font-size="10" text-anchor="end">₹${Math.round(maxVal * 0.5 / 1000)}k</text>
          <text x="${padding.left - 8}" y="${height - padding.bottom}" fill="#64748b" font-size="10" text-anchor="end">₹0</text>

          <!-- Paths -->
          <path d="M ${grossPoints}" fill="none" stroke="#3b82f6" stroke-width="2.5" />
          <path d="M ${netPoints}" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="4,2" />
          <path d="M ${bankPoints}" fill="none" stroke="#38bdf8" stroke-width="2.5" />

          <!-- Interactive Dots -->
          ${trends.map((t, i) => `
            <circle cx="${xScale(i)}" cy="${yScale(t.grossSales)}" r="3" fill="#3b82f6" />
            <circle cx="${xScale(i)}" cy="${yScale(t.bankReceipts)}" r="3" fill="#38bdf8" />
            <text x="${xScale(i)}" y="${height - 10}" fill="#64748b" font-size="9" text-anchor="middle">${t.date.substring(5)}</text>
          `).join('')}
        </svg>
      `;

      chartContainer.innerHTML = svgHtml;
    } catch (e) {
      console.error('Trend chart render error:', e);
    }
  },

  bindEvents(container) {
    // Drawer toggles
    container.querySelectorAll('.btn-expand-accounts').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const drawer = document.getElementById(targetId);
        const arrow = btn.querySelector('.expand-arrow');
        if (drawer) {
          const isShown = drawer.style.display !== 'none';
          drawer.style.display = isShown ? 'none' : 'block';
          if (arrow) arrow.textContent = isShown ? '▼' : '▲';
        }
      });
    });
  },

  bindFlipCard(container) {
    const cards = container.querySelectorAll('.sales-flip-card');
    cards.forEach(card => {
      // Desktop hover updates aria-expanded and adds .is-hovered
      card.addEventListener('mouseenter', () => {
        card.classList.add('is-hovered');
        card.setAttribute('aria-expanded', 'true');
      });

      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-hovered');
        if (!card.classList.contains('is-flipped')) {
          card.setAttribute('aria-expanded', 'false');
        }
      });

      // Touchscreen / mobile tap-to-toggle (hover is not available on touchscreens)
      card.addEventListener('pointerup', (e) => {
        const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen' ||
                        (window.matchMedia && window.matchMedia('(hover: none)').matches);
        if (isTouch) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          card.classList.toggle('is-flipped');
          const isFlipped = card.classList.contains('is-flipped');
          card.setAttribute('aria-expanded', isFlipped ? 'true' : 'false');
        }
        // Note: Desktop mouse clicks intentionally do NOT flip the card (preserved for future actions)
      });

      // Total Sales card click opens platform selection modal
      if (card.id === 'salesFlipCard') {
        card.addEventListener('click', () => {
          this.showPlatformSelectionModal();
        });
      }

      // Keyboard accessibility: Enter or Space toggles flip
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.classList.toggle('is-flipped');
          const isFlipped = card.classList.contains('is-flipped');
          card.setAttribute('aria-expanded', isFlipped ? 'true' : 'false');
        }
      });
    });
  },

  showPlatformSelectionModal() {
    const modal = document.getElementById('appModal');
    const card = document.getElementById('modalCard');
    if (!modal || !card) return;

    const platforms = [
      {
        key: 'amazon',
        name: 'Amazon',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;background:#232f3e;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 15c4 3 12 3 16 0" stroke="#FF9900" stroke-width="2.5" stroke-linecap="round"/><path d="M17.5 13.5l2.5 1.5-1.5 2.5" fill="#FF9900"/><text x="6" y="12" fill="#FFFFFF" font-size="11" font-weight="900" font-family="Arial, sans-serif">a</text></svg></span>`
      },
      {
        key: 'flipkart',
        name: 'Flipkart',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;background:#2874f0;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 7h12l-1.5 13h-9L6 7z" fill="#FFFFFF"/><path d="M9 7V4.5a2.5 2.5 0 015 0V7" stroke="#FFFFFF" stroke-width="2"/><text x="9.5" y="16" fill="#2874f0" font-size="11" font-weight="900" font-style="italic" font-family="Arial, sans-serif">f</text></svg></span>`
      },
      {
        key: 'meesho',
        name: 'Meesho',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;background:#9b2c89;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 18V8.5a2 2 0 014 0v5a2 2 0 004 0v-5a2 2 0 014 0V18" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
      },
      {
        key: 'blinkit',
        name: 'Blinkit',
        logoSvg: `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;background:#f8cb46;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><text x="6" y="17" fill="#0c831f" font-size="16" font-weight="900" font-family="Arial, sans-serif">b</text></svg></span>`
      }
    ];

    card.innerHTML = `
      <div class="modal-header" style="border-bottom: 1px solid var(--border-color); padding: 18px 24px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div class="modal-title" style="font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
            <span style="color: #059669;">🛍️</span> Select Marketplace Platform
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
            Choose a platform to view dedicated seller accounts
          </div>
        </div>
        <button class="btn-close-modal" id="btnClosePlatformModal" aria-label="Close modal" style="background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; line-height: 1;">✕</button>
      </div>

      <div class="modal-body" style="padding: 24px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
          ${platforms.map(p => `
            <button type="button" class="platform-select-btn" data-platform="${p.key}" style="display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 18px; background: #ffffff; border: 1.5px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; text-align: left; width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
              <div style="display: flex; align-items: center; gap: 12px;">
                ${p.logoSvg}
                <div>
                  <div style="font-size: 14px; font-weight: 700; color: var(--text-main);">${p.name}</div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">View Seller Accounts</div>
                </div>
              </div>
              <span style="color: #059669; font-size: 15px; font-weight: 700;">➔</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    modal.classList.add('active');

    const closeModal = () => {
      modal.classList.remove('active');
      document.removeEventListener('keydown', handleKeyDown);
      modal.removeEventListener('click', handleBackdropClick);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };

    const handleBackdropClick = (e) => {
      if (e.target === modal) {
        closeModal();
      }
    };

    const closeBtn = card.querySelector('#btnClosePlatformModal');
    if (closeBtn) closeBtn.onclick = closeModal;

    modal.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeyDown);

    card.querySelectorAll('.platform-select-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = '#10b981';
        btn.style.background = '#f0fdf4';
        btn.style.transform = 'translateY(-1px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = 'var(--border-color)';
        btn.style.background = '#ffffff';
        btn.style.transform = 'translateY(0)';
      });
      btn.addEventListener('click', () => {
        const platformKey = btn.getAttribute('data-platform');
        closeModal();
        if (window.AppState) {
          window.AppState.set('selectedPlatform', platformKey);
          window.AppState.setActiveView('accounts-' + platformKey);
        }
      });
    });
  }
};

window.DashboardView = DashboardView;
