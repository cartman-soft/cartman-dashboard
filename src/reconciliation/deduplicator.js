/**
 * Bank Statement & Transaction Deduplication Service
 * Prevents double-counting by calculating deterministic hashes for statements and transactions.
 */

const crypto = require('crypto');
const { db, TABLES } = require('../db');

class Deduplicator {
  /**
   * Generates a SHA-256 checksum for an uploaded statement buffer
   */
  static computeFileChecksum(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Generates a deterministic transaction fingerprint
   */
  static computeTransactionFingerprint(tx) {
    const date = tx.transactionDate || '';
    const ref = (tx.utrNo || tx.referenceNo || '').trim().toUpperCase();
    const desc = (tx.description || '').replace(/\s+/g, ' ').trim().toUpperCase().substring(0, 40);
    const cr = (Number(tx.creditAmount) || 0).toFixed(2);
    const dr = (Number(tx.debitAmount) || 0).toFixed(2);

    const raw = `${date}#${ref}#${desc}#${cr}#${dr}`;
    return crypto.createHash('md5').update(raw).digest('hex');
  }

  /**
   * Checks if an identical bank statement was already uploaded
   */
  static isDuplicateStatement(fileChecksum) {
    const existing = db.findOne(TABLES.BANK_STATEMENTS, s => s.fileChecksum === fileChecksum);
    return existing || null;
  }

  /**
   * Identifies duplicates among incoming transactions vs existing DB transactions
   */
  static checkTransactionDuplicates(incomingRecords) {
    const existingTxns = db.find(TABLES.BANK_TRANSACTIONS);
    const existingHashes = new Set();

    for (const tx of existingTxns) {
      existingHashes.add(this.computeTransactionFingerprint(tx));
    }

    const seenInBatch = new Set();
    const results = [];
    let duplicateCount = 0;

    for (const record of incomingRecords) {
      const hash = this.computeTransactionFingerprint(record);
      const isDuplicate = existingHashes.has(hash) || seenInBatch.has(hash);

      if (isDuplicate) {
        duplicateCount++;
      } else {
        seenInBatch.add(hash);
      }

      results.push({
        ...record,
        fingerprint: hash,
        isDuplicate
      });
    }

    return {
      records: results,
      duplicateCount,
      uniqueCount: incomingRecords.length - duplicateCount
    };
  }
}

module.exports = Deduplicator;
