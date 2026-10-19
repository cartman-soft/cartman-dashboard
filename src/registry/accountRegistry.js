/**
 * Central Seller-Account Registry for Cartman E-Commerce Dashboard
 *
 * Single source of truth for the 14 registered platform accounts:
 * - Amazon (5 accounts): Cartman, Chicagozone, Nestly, Silkmum, Megadeals
 * - Flipkart (3 accounts): Nestly, Chicagozone, Cartman
 * - Meesho (4 accounts): Cartman, Nexify, Nestly, Silkmum
 * - Blinkit (2 accounts): Cartman, Babybean
 *
 * Rules:
 * 1. Exactly 14 platform-account entries in total.
 * 2. The same account name on different platforms is treated as a separate platform-account entry.
 * 3. Account names are labels only until verified account identifiers become available.
 * 4. No invented account IDs, login credentials, or passwords.
 */

const { TABLES } = require('../db/schema');

const REGISTERED_ACCOUNTS = [
  // Amazon — 5 accounts
  {
    id: 'amz_cartman',
    marketplace: 'amazon',
    accountName: 'Cartman',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'amz_chicagozone',
    marketplace: 'amazon',
    accountName: 'Chicagozone',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'amz_nestly',
    marketplace: 'amazon',
    accountName: 'Nestly',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'amz_silkmum',
    marketplace: 'amazon',
    accountName: 'Silkmum',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'amz_megadeals',
    marketplace: 'amazon',
    accountName: 'Megadeals',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },

  // Flipkart — 3 accounts
  {
    id: 'fk_nestly',
    marketplace: 'flipkart',
    accountName: 'Nestly',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'fk_chicagozone',
    marketplace: 'flipkart',
    accountName: 'Chicagozone',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'fk_cartman',
    marketplace: 'flipkart',
    accountName: 'Cartman',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },

  // Meesho — 4 accounts
  {
    id: 'msh_cartman',
    marketplace: 'meesho',
    accountName: 'Cartman',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'msh_nexify',
    marketplace: 'meesho',
    accountName: 'Nexify',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'msh_nestly',
    marketplace: 'meesho',
    accountName: 'Nestly',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'msh_silkmum',
    marketplace: 'meesho',
    accountName: 'Silkmum',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },

  // Blinkit — 2 accounts
  {
    id: 'blk_cartman',
    marketplace: 'blinkit',
    accountName: 'Cartman',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  },
  {
    id: 'blk_babybean',
    marketplace: 'blinkit',
    accountName: 'Babybean',
    sellerId: null,
    isVerified: false,
    connectionStatus: 'connected'
  }
];

class AccountRegistry {
  /**
   * Returns all 14 registered accounts
   */
  static getAllAccounts() {
    return REGISTERED_ACCOUNTS.map(a => ({ ...a }));
  }

  /**
   * Returns registered accounts for a specific marketplace
   * @param {string} marketplace 'amazon' | 'flipkart' | 'meesho' | 'blinkit'
   */
  static getAccountsByPlatform(marketplace) {
    if (!marketplace) return [];
    const mkt = marketplace.toLowerCase().trim();
    return REGISTERED_ACCOUNTS
      .filter(a => a.marketplace.toLowerCase() === mkt)
      .map(a => ({ ...a }));
  }

  /**
   * Find a registered account by its platform and account name
   */
  static findAccount(marketplace, accountName) {
    if (!marketplace || !accountName) return null;
    const mkt = marketplace.toLowerCase().trim();
    const name = accountName.toLowerCase().trim();
    const match = REGISTERED_ACCOUNTS.find(
      a => a.marketplace.toLowerCase() === mkt && a.accountName.toLowerCase() === name
    );
    return match ? { ...match } : null;
  }

  /**
   * Find a registered account by ID
   */
  static getAccountById(id) {
    if (!id) return null;
    const match = REGISTERED_ACCOUNTS.find(a => a.id === id);
    return match ? { ...match } : null;
  }

  /**
   * Synchronizes the 14 registered accounts to the database table TABLES.MARKETPLACE_ACCOUNTS.
   * Ensures that exactly these 14 platform-account entries exist in the database.
   */
  static syncRegistryToDb(db) {
    const validIds = new Set(REGISTERED_ACCOUNTS.map(a => a.id));
    const validPairs = new Set(REGISTERED_ACCOUNTS.map(a => `${a.marketplace.toLowerCase()}::${a.accountName.toLowerCase()}`));

    // 1. Remove obsolete accounts that are not in the 14-account registry
    const existing = db.find(TABLES.MARKETPLACE_ACCOUNTS);
    for (const acc of existing) {
      const pair = `${(acc.marketplace || '').toLowerCase()}::${(acc.accountName || '').toLowerCase()}`;
      if (!validIds.has(acc.id) && !validPairs.has(pair)) {
        db.delete(TABLES.MARKETPLACE_ACCOUNTS, acc.id);
      }
    }

    // 2. Ensure all 14 registry accounts are inserted or kept up to date
    for (const reg of REGISTERED_ACCOUNTS) {
      const existingRecord = db.findOne(
        TABLES.MARKETPLACE_ACCOUNTS,
        a => a.id === reg.id || (a.marketplace.toLowerCase() === reg.marketplace.toLowerCase() && a.accountName.toLowerCase() === reg.accountName.toLowerCase())
      );

      if (existingRecord) {
        db.update(TABLES.MARKETPLACE_ACCOUNTS, existingRecord.id, {
          marketplace: reg.marketplace,
          accountName: reg.accountName,
          sellerId: existingRecord.sellerId || reg.sellerId,
          isVerified: existingRecord.isVerified || reg.isVerified,
          connectionStatus: reg.connectionStatus || 'connected',
          isDemo: false
        });
      } else {
        db.insert(TABLES.MARKETPLACE_ACCOUNTS, {
          id: reg.id,
          marketplace: reg.marketplace,
          accountName: reg.accountName,
          sellerId: reg.sellerId,
          isVerified: reg.isVerified,
          connectionStatus: reg.connectionStatus || 'connected',
          isDemo: false
        });
      }
    }

    return db.find(TABLES.MARKETPLACE_ACCOUNTS);
  }
}

module.exports = {
  AccountRegistry,
  REGISTERED_ACCOUNTS
};
