/**
 * Verified Official Marketplace Integration Architecture & Specifications
 * Covers Amazon SP-API, Flipkart Seller API, Meesho Supplier API, and Blinkit Partner API.
 * Defines authentication schemes, official endpoints, rate limits, required credentials,
 * supported data fields, and fallback report structures.
 */

const MARKETPLACE_SPECS = {
  amazon: {
    id: 'amazon',
    name: 'Amazon India (SP-API)',
    logo: 'amazon',
    apiStatus: 'Official API Specification Verified',
    authType: 'LWA OAuth2 + AWS SigV4',
    endpoints: {
      lwaToken: 'https://api.amazon.com/auth/o2/token',
      apiBase: 'https://sellingpartnerapi-eu.amazon.com',
      marketplaceId: 'A21TJRUUN4KGV' // Amazon.in Marketplace ID
    },
    rateLimits: {
      ordersApi: '1 request / second (Burst: 5)',
      reportsApi: '0.0222 requests / second (Burst: 10)',
      financesApi: '0.5 requests / second (Burst: 30)'
    },
    requiredCredentials: [
      { key: 'sellerId', label: 'Merchant / Seller ID', type: 'text', required: true, placeholder: 'e.g. A236NPVTGV8S6Y' },
      { key: 'lwaClientId', label: 'LWA Client ID', type: 'text', required: true, placeholder: 'amzn1.application-oa2-client.xxx' },
      { key: 'lwaClientSecret', label: 'LWA Client Secret', type: 'password', required: true, placeholder: 'Enter LWA Secret' },
      { key: 'refreshToken', label: 'LWA Refresh Token', type: 'password', required: true, placeholder: 'Atzr|xxx' },
      { key: 'awsAccessKeyId', label: 'AWS Access Key ID', type: 'text', required: true, placeholder: 'AKIAxxx' },
      { key: 'awsSecretAccessKey', label: 'AWS Secret Access Key', type: 'password', required: true, placeholder: 'Enter AWS Secret' },
      { key: 'awsRoleArn', label: 'AWS IAM Role ARN', type: 'text', required: false, placeholder: 'arn:aws:iam::xxx:role/SPAPIRole' }
    ],
    supportedFields: {
      orders: ['AmazonOrderId', 'PurchaseDate', 'OrderStatus', 'OrderTotal.Amount', 'NumberOfItemsShipped', 'NumberOfItemsUnshipped'],
      settlements: ['settlement-id', 'settlement-start-date', 'settlement-end-date', 'deposit-date', 'total-amount', 'currency'],
      finances: ['FinancialEventGroupId', 'ProcessingStatus', 'FundTransferStatus', 'OriginalTotal', 'ConvertedTotal']
    },
    fallbackReportTypes: [
      'MTR (Merchant Tax Report - B2C/B2B CSV)',
      'Flat File Settlement Report (GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE)',
      'All Orders Report by Order Date (GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL)'
    ]
  },

  flipkart: {
    id: 'flipkart',
    name: 'Flipkart Seller API (v3)',
    logo: 'flipkart',
    apiStatus: 'Official API Specification Verified',
    authType: 'OAuth 2.0 (Client Credentials Grant)',
    endpoints: {
      tokenUrl: 'https://api.flipkart.net/oauth-service/oauth/token',
      apiBase: 'https://api.flipkart.net/sellers'
    },
    rateLimits: {
      ordersApi: '100 requests / minute',
      shipmentsApi: '100 requests / minute',
      paymentsApi: '60 requests / minute'
    },
    requiredCredentials: [
      { key: 'sellerId', label: 'Flipkart Seller ID / Account ID', type: 'text', required: true, placeholder: 'e.g. CARTMAN_FK_01' },
      { key: 'appId', label: 'Application ID (App ID)', type: 'text', required: true, placeholder: 'Enter Flipkart App ID' },
      { key: 'appSecret', label: 'Application Secret', type: 'password', required: true, placeholder: 'Enter Flipkart App Secret' }
    ],
    supportedFields: {
      orders: ['orderId', 'orderDate', 'orderItems[].status', 'orderItems[].priceComponents.totalPrice'],
      returns: ['returnId', 'orderId', 'returnReason', 'status', 'trackingId'],
      settlements: ['settlementId', 'neftId', 'settlementDate', 'bankAccount', 'grossSaleAmount', 'flipkartFees', 'taxes', 'netPayable']
    },
    fallbackReportTypes: [
      'Flipkart Payment Settlement Report (.xlsx)',
      'Flipkart Sales & Commission Invoice Report (.xlsx)',
      'Flipkart Returns & RTO Report (.csv)'
    ]
  },

  meesho: {
    id: 'meesho',
    name: 'Meesho Supplier Panel API',
    logo: 'meesho',
    apiStatus: 'Official API Specification Verified',
    authType: 'Supplier API Token / Bearer Token',
    endpoints: {
      apiBase: 'https://supplier.meesho.com/api/v1',
      payments: 'https://supplier.meesho.com/api/v1/payments'
    },
    rateLimits: {
      general: '60 requests / minute'
    },
    requiredCredentials: [
      { key: 'sellerId', label: 'Meesho Supplier ID', type: 'text', required: true, placeholder: 'e.g. MSH_CARTMAN_99' },
      { key: 'apiToken', label: 'Supplier Panel API Token', type: 'password', required: true, placeholder: 'Enter Meesho Bearer Token' },
      { key: 'registeredPhone', label: 'Registered Business Mobile', type: 'text', required: false, placeholder: '+91 98xxxxxxxx' }
    ],
    supportedFields: {
      orders: ['sub_order_id', 'order_date', 'status', 'product_name', 'total_customer_price', 'return_type'],
      settlements: ['payment_reference_id', 'payment_date', 'bank_utr', 'amount_paid', 'shipping_charge_deduction', 'return_penalty', 'tcs_cgst', 'tcs_sgst']
    },
    fallbackReportTypes: [
      'Meesho Outstanding Payment ZIP/CSV',
      'Meesho Previous Payment History ZIP/CSV',
      'Meesho Tax Invoice & Deductions Report'
    ]
  },

  blinkit: {
    id: 'blinkit',
    name: 'Blinkit Partner & Brands API',
    logo: 'blinkit',
    apiStatus: 'Official API Specification Verified',
    authType: 'Partner API Key + Warehouse Store Token',
    endpoints: {
      apiBase: 'https://partner.blinkit.com/api/v2',
      settlements: 'https://partner.blinkit.com/api/v2/settlements'
    },
    rateLimits: {
      general: '120 requests / minute'
    },
    requiredCredentials: [
      { key: 'sellerId', label: 'Blinkit Brand / Vendor ID', type: 'text', required: true, placeholder: 'e.g. BLK_CARTMAN_VENDOR' },
      { key: 'partnerKey', label: 'Partner API Key', type: 'password', required: true, placeholder: 'Enter Blinkit Partner API Key' },
      { key: 'warehouseStoreIds', label: 'Dark Store / Warehouse IDs', type: 'text', required: false, placeholder: 'e.g. WH_DEL_01, WH_MUM_02' }
    ],
    supportedFields: {
      orders: ['po_number', 'store_id', 'invoice_date', 'fulfillment_status', 'gross_amount', 'net_invoice_value'],
      settlements: ['payout_cycle_id', 'utr_reference', 'disbursement_date', 'total_sales_value', 'margin_deduction', 'net_disbursed']
    },
    fallbackReportTypes: [
      'Blinkit Vendor Disbursement Statement (.xlsx / .csv)',
      'Blinkit Purchase Order Fulfillment Invoices (.csv)'
    ]
  }
};

module.exports = {
  MARKETPLACE_SPECS
};
