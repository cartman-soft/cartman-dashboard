# CARTMAN — E-Commerce Sales & Payment Dashboard

Production-oriented, responsive web application built for **Cartman** to centralize multi-marketplace sales, orders, settlements, and bank reconciliation across **Amazon, Flipkart, Meesho, and Blinkit**.

---

## 🌟 Key Architecture & Capabilities

### 1. Company Overview Dashboard
- **10 Core Grand Totals (INR ₹)**:
  - **Gross Sales**: Full customer invoice value before cancellations/returns.
  - **Net Sales**: Deduplicated revenue after subtracting cancellations, customer returns, and refunds.
  - **Total Orders**: All placed orders across all platforms.
  - **Cancelled Orders**: Pre-dispatch cancellations.
  - **Returned Orders**: Customer returns and RTOs.
  - **Total Marketplace Settlements**: Disbursed settlement batches.
  - **Actual Bank Receipts**: Verified funds credited to bank account.
  - **Sales-vs-Received Gap**: Cash timing lag (T+7 to T+15 days) and return reserve withholdings.
  - **Actual Settlement Pending**: Net payable from unsettled marketplace statements (Pending/On-Hold). *Never assumed to equal Sales minus Bank Receipts.*
  - **Unmatched Bank Transactions**: Inward bank remittances not yet linked to a settlement batch.
- **Individual Marketplace Cards**: Dedicated cards for **Amazon**, **Flipkart**, **Meesho**, and **Blinkit** with aggregated metrics and expandable seller account drill-downs.
- **Interactive 14-Day Financial Trend Chart**: Visual comparison of Gross Sales, Net Sales, and Bank Receipts.

### 2. Multi-Account Management
- Multiple accounts per marketplace (e.g. Amazon Direct FBA + Amazon Bazaar, Flipkart Retail + Flipkart Wholesale, Meesho Apparel + Meesho Beauty, Blinkit QuickCommerce NCR + Mumbai).
- Connection status monitoring, last sync timestamps, error diagnostics, and on-demand synchronization.

### 3. Date Range Filtering
- **Daily** (Specific day selection)
- **Monthly** (Current month, past months)
- **Custom Date Range** (Start date to End date)
- Applied uniformly across Orders, Settlements, and Bank Receipts.

### 4. Unified Order Lifecycle Mapping
- Normalizes disparate marketplace order statuses into 6 standardized states:
  `New`, `Processing`, `Shipped`, `Delivered`, `Cancelled`, `Returned`.
- Broken down at Company, Marketplace, and Account levels.

### 5. Payment & Settlement Reconciliation Engine
- Multi-tier matching algorithm:
  1. **Exact UTR Match** (100% confidence)
  2. **Settlement Reference in Bank Description** (95% confidence)
  3. **Amount Match + Date Proximity (+/- 3 days)** (90% confidence)
  4. **Partial / Tolerant Amount Match (TCS/TDS buffer)** (75% confidence)
- Manual transaction linking/unlinking controls.

### 6. Bank Statement Ingestion (.xlsx / .csv)
- Ingests bank statements from major Indian banks: **HDFC Bank, ICICI Bank, State Bank of India (SBI), Axis Bank, Kotak Mahindra Bank**, and **Cartman Standard Template**.
- Pre-import validation, column mapping inspection, top row preview.
- SHA-256 statement checksums and transaction fingerprinting to **prevent duplicate imports and double-counting**.
- Downloadable sample templates available in both `.csv` and `.xlsx`.

### 7. Verified Marketplace API Integrations
- Verified specifications for:
  - **Amazon SP-API** (Orders API, Reports API - MTR/Settlements, Finances API, LWA OAuth2 + SigV4).
  - **Flipkart Seller API v3** (Orders, Shipments, Returns, Settlement Payments, OAuth2).
  - **Meesho Supplier Panel API** (Orders, Outstanding & Previous Payments, Bearer Token).
  - **Blinkit Partner API** (Retail Invoices, Warehouse Dispatch, Settlements).
- Fallback report file ingestion for all 4 marketplaces.
- **DEMO DATA Mode Switch**: Prominently displays `DEMO DATA` banner and provides a single-click toggle to isolate real imported data.

### 8. Scheduled Automatic Synchronization
- Background scheduler running every 15 minutes.
- Retry policies, execution logging in `sync_logs`, and idempotency protections.

### 9. Multi-Format Report Exports
- **Excel (.xlsx)**: 5-sheet comprehensive workbook (Company Overview, Marketplaces, Seller Accounts, Settlements Reconciliation, Bank Transactions).
- **CSV (.csv)**: Clean tabular exports by requested dimension.
- **Printable / PDF Statement**: High-fidelity letterhead report formatted for printing or saving as PDF.

### 10. Role-Based Access Control (RBAC) & 2FA OTP
- Roles: `Admin`, `Accounts`, `Staff`.
- Passwords hashed with `bcryptjs` (salt 10).
- 2-Factor 6-digit OTP verification with expiration and lockout protection.
- Tamper-evident `audit_logs` tracking sensitive operations.

---

## 🚀 Running the Application

### Prerequisites
- Node.js (v16.17+ or higher)

### Start the Server
```powershell
cd c:\Users\Rushit\Downloads\cartman-dashboard
npm start
```

Open browser at: **`http://localhost:4000`**

### Default Credentials
| Role | Email | Password | Default OTP |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@cartman.com` | `CartmanAdmin2026!` | `123456` *(or auto-filled dev code)* |
| **Accounts** | `accounts@cartman.com` | `CartmanAcc2026!` | `123456` |
| **Staff** | `staff@cartman.com` | `CartmanStaff2026!` | `123456` |

---

## 🧪 Running Automated Tests
```powershell
cd c:\Users\Rushit\Downloads\cartman-dashboard
npm test
```
All 12 automated unit and integration tests validate:
- Gross & Net Sales deduplication
- Order status normalization
- Settlement Pending vs Sales Gap integrity
- Bank statement parsing & Indian bank profiles
- Transaction deduplication
- Reconciliation matching engine (UTR, Narration, Amount)
- Date range filtering
- Bcrypt password hashing & OTP authentication
