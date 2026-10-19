/**
 * Marketplace Settlement to Bank Receipt Reconciliation Matcher
 * Executes multi-tier matching strategies:
 * 1. Exact UTR / Bank Reference Match (100% confidence)
 * 2. Marketplace Settlement ID inside Bank Narration (95% confidence)
 * 3. Exact Payout Amount + Date Window (+/- 3 days) (90% confidence)
 * 4. Partial / Tolerant Amount Match (TCS/TDS adjustment within 2%) (75% confidence)
 */

const { db, TABLES } = require('../db');

class ReconciliationMatcher {
  /**
   * Run automated reconciliation on all unmatched bank transactions against available settlements
   */
  static runReconciliation(filter = {}) {
    const settlements = db.find(TABLES.SETTLEMENTS);
    const bankTxns = db.find(TABLES.BANK_TRANSACTIONS, tx => tx.creditAmount > 0);

    // Track which settlements have already been matched to avoid double matching
    const matchedSettlementIds = new Set();
    for (const tx of bankTxns) {
      if (tx.reconciliationStatus === 'matched' && tx.matchedSettlementId) {
        matchedSettlementIds.add(tx.matchedSettlementId);
      }
    }

    let newlyMatchedCount = 0;
    const matchResults = [];

    for (const tx of bankTxns) {
      if (tx.reconciliationStatus === 'matched' && tx.matchedSettlementId) {
        continue; // Already matched
      }

      if (tx.isDuplicate) {
        db.update(TABLES.BANK_TRANSACTIONS, tx.id, {
          reconciliationStatus: 'duplicate',
          notes: 'Flagged as duplicate bank transaction. Excluded from reconciliation matching.'
        });
        continue;
      }

      let bestMatch = null;
      let highestScore = 0;
      let matchType = null;

      for (const st of settlements) {
        if (matchedSettlementIds.has(st.id)) continue;

        const scoreObj = this._evaluateMatch(tx, st);
        if (scoreObj.score > highestScore && scoreObj.score >= 70) {
          highestScore = scoreObj.score;
          bestMatch = st;
          matchType = scoreObj.type;
        }
      }

      if (bestMatch) {
        matchedSettlementIds.add(bestMatch.id);
        newlyMatchedCount++;

        const updatedTx = db.update(TABLES.BANK_TRANSACTIONS, tx.id, {
          reconciliationStatus: highestScore >= 85 ? 'matched' : 'partial',
          matchedSettlementId: bestMatch.id,
          matchType,
          matchScore: highestScore,
          notes: `Auto-matched via ${matchType} with Settlement ID ${bestMatch.settlementId} (Payout: ₹${bestMatch.netPayout.toLocaleString('en-IN')})`
        });

        matchResults.push({
          transactionId: tx.id,
          settlementId: bestMatch.id,
          settlementRef: bestMatch.settlementId,
          marketplace: bestMatch.marketplace,
          creditAmount: tx.creditAmount,
          settlementPayout: bestMatch.netPayout,
          matchType,
          score: highestScore
        });
      } else {
        db.update(TABLES.BANK_TRANSACTIONS, tx.id, {
          reconciliationStatus: 'unmatched',
          matchType: null,
          matchScore: 0,
          notes: 'No corresponding marketplace settlement payout found within tolerance parameters.'
        });
      }
    }

    return {
      success: true,
      newlyMatchedCount,
      matches: matchResults,
      summary: this.getReconciliationSummary()
    };
  }

  /**
   * Helper to score match probability between bank transaction and settlement
   */
  static _evaluateMatch(tx, st) {
    const txUtr = (tx.utrNo || tx.referenceNo || '').trim().toUpperCase();
    const stUtr = (st.bankRefId || '').trim().toUpperCase();
    const txDesc = (tx.description || '').toUpperCase();
    const stId = (st.settlementId || '').toUpperCase();

    // Strategy 1: Exact UTR / Reference match
    if (txUtr && stUtr && (txUtr === stUtr || txUtr.includes(stUtr) || stUtr.includes(txUtr))) {
      return { score: 100, type: 'exact_utr' };
    }

    // Strategy 2: Settlement ID found in Bank Description
    if (stId && txDesc.includes(stId)) {
      return { score: 95, type: 'reference_in_narration' };
    }

    // Strategy 3: Amount match + Date window
    const cr = Number(tx.creditAmount) || 0;
    const payout = Number(st.netPayout) || 0;
    const amountDiff = Math.abs(cr - payout);

    const txDate = new Date(tx.transactionDate);
    const stDate = new Date(st.settlementDate);
    const daysDiff = Math.abs((txDate.getTime() - stDate.getTime()) / (1000 * 3600 * 24));

    // Exact amount within +/- 3 business days
    if (amountDiff < 1.0 && daysDiff <= 4) {
      // Check if marketplace name hints match
      const mktName = st.marketplace.toUpperCase();
      const descHasMkt = txDesc.includes(mktName) ||
        (mktName === 'AMAZON' && txDesc.includes('AMZN')) ||
        (mktName === 'FLIPKART' && (txDesc.includes('FK') || txDesc.includes('CITIN'))) ||
        (mktName === 'MEESHO' && txDesc.includes('FASHNEAR')) ||
        (mktName === 'BLINKIT' && txDesc.includes('GROFERS'));

      return {
        score: descHasMkt ? 92 : 88,
        type: 'exact_amount_date'
      };
    }

    // Strategy 4: Partial / Tolerant match (TCS 1% + TDS 0.1% or bank fees) within 4 days
    if (payout > 0 && amountDiff <= (payout * 0.03) && daysDiff <= 4) {
      return { score: 75, type: 'partial_amount' };
    }

    return { score: 0, type: 'none' };
  }

  /**
   * Generates comprehensive payment reconciliation report data
   */
  static getReconciliationSummary(filter = {}) {
    const settlements = db.find(TABLES.SETTLEMENTS);
    const bankTxns = db.find(TABLES.BANK_TRANSACTIONS, tx => tx.creditAmount > 0);
    const accounts = db.find(TABLES.MARKETPLACE_ACCOUNTS);
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    let totalSettlementsDisbursed = 0;
    let totalSettlementsPending = 0;
    let totalSettlementsOnHold = 0;

    const settlementList = settlements.map(st => {
      const payout = Number(st.netPayout) || 0;
      if (st.status === 'disbursed') totalSettlementsDisbursed += payout;
      else if (st.status === 'pending') totalSettlementsPending += payout;
      else if (st.status === 'on_hold') totalSettlementsOnHold += payout;

      // Find matched bank transaction
      const matchedTx = bankTxns.find(tx => tx.matchedSettlementId === st.id);

      const acc = accountMap.get(st.accountId);

      return {
        id: st.id,
        settlementId: st.settlementId,
        marketplace: st.marketplace,
        accountId: st.accountId,
        accountName: acc ? acc.accountName : 'Unknown Account',
        sellerId: acc ? acc.sellerId : '',
        settlementDate: st.settlementDate,
        periodStart: st.periodStart,
        periodEnd: st.periodEnd,
        grossSales: st.grossSales,
        commissionFee: st.commissionFee,
        fixedFee: st.fixedFee,
        shippingFee: st.shippingFee,
        refunds: st.refunds,
        taxes: st.taxes,
        netPayout: st.netPayout,
        status: st.status,
        bankRefId: st.bankRefId,
        isReconciled: !!matchedTx,
        matchedBankTx: matchedTx ? {
          id: matchedTx.id,
          transactionDate: matchedTx.transactionDate,
          creditAmount: matchedTx.creditAmount,
          referenceNo: matchedTx.referenceNo,
          utrNo: matchedTx.utrNo,
          matchType: matchedTx.matchType,
          matchScore: matchedTx.matchScore
        } : null
      };
    });

    let totalBankCredits = 0;
    let matchedBankAmount = 0;
    let unmatchedBankAmount = 0;
    let partialBankAmount = 0;
    let duplicateBankAmount = 0;

    let matchedTxCount = 0;
    let unmatchedTxCount = 0;
    let partialTxCount = 0;
    let duplicateTxCount = 0;

    const transactionList = bankTxns.map(tx => {
      const cr = Number(tx.creditAmount) || 0;
      totalBankCredits += cr;

      if (tx.reconciliationStatus === 'matched') {
        matchedBankAmount += cr;
        matchedTxCount++;
      } else if (tx.reconciliationStatus === 'partial') {
        partialBankAmount += cr;
        partialTxCount++;
      } else if (tx.reconciliationStatus === 'duplicate') {
        duplicateBankAmount += cr;
        duplicateTxCount++;
      } else {
        unmatchedBankAmount += cr;
        unmatchedTxCount++;
      }

      const st = tx.matchedSettlementId ? settlements.find(s => s.id === tx.matchedSettlementId) : null;
      const acc = st ? accountMap.get(st.accountId) : null;

      return {
        id: tx.id,
        statementId: tx.statementId,
        transactionDate: tx.transactionDate,
        description: tx.description,
        referenceNo: tx.referenceNo,
        utrNo: tx.utrNo,
        creditAmount: tx.creditAmount,
        debitAmount: tx.debitAmount,
        balance: tx.balance,
        reconciliationStatus: tx.reconciliationStatus,
        matchType: tx.matchType,
        matchScore: tx.matchScore,
        notes: tx.notes,
        isDuplicate: tx.isDuplicate,
        matchedSettlement: st ? {
          id: st.id,
          settlementId: st.settlementId,
          marketplace: st.marketplace,
          accountName: acc ? acc.accountName : '',
          netPayout: st.netPayout,
          settlementDate: st.settlementDate
        } : null
      };
    });

    return {
      totals: {
        totalSettlementsDisbursed: Math.round(totalSettlementsDisbursed * 100) / 100,
        totalSettlementsPending: Math.round(totalSettlementsPending * 100) / 100,
        totalSettlementsOnHold: Math.round(totalSettlementsOnHold * 100) / 100,
        actualSettlementPending: Math.round((totalSettlementsPending + totalSettlementsOnHold) * 100) / 100,
        totalBankCredits: Math.round(totalBankCredits * 100) / 100,
        matchedBankAmount: Math.round(matchedBankAmount * 100) / 100,
        unmatchedBankAmount: Math.round(unmatchedBankAmount * 100) / 100,
        partialBankAmount: Math.round(partialBankAmount * 100) / 100,
        duplicateBankAmount: Math.round(duplicateBankAmount * 100) / 100,
        counts: {
          totalTransactions: bankTxns.length,
          matched: matchedTxCount,
          unmatched: unmatchedTxCount,
          partial: partialTxCount,
          duplicate: duplicateTxCount,
          totalSettlements: settlements.length
        }
      },
      settlements: settlementList,
      transactions: transactionList
    };
  }

  /**
   * Manually pair a bank transaction to a settlement record
   */
  static manualMatch(bankTransactionId, settlementId, note = 'Manually matched by accountant') {
    const tx = db.findById(TABLES.BANK_TRANSACTIONS, bankTransactionId);
    if (!tx) throw new Error(`Bank transaction '${bankTransactionId}' not found.`);

    const st = db.findById(TABLES.SETTLEMENTS, settlementId);
    if (!st) throw new Error(`Settlement '${settlementId}' not found.`);

    db.update(TABLES.BANK_TRANSACTIONS, bankTransactionId, {
      reconciliationStatus: 'matched',
      matchedSettlementId: settlementId,
      matchType: 'manual',
      matchScore: 100,
      notes: note
    });

    return { success: true, message: 'Bank transaction successfully linked to settlement.' };
  }

  /**
   * Unpair a matched transaction
   */
  static unmatch(bankTransactionId) {
    const tx = db.findById(TABLES.BANK_TRANSACTIONS, bankTransactionId);
    if (!tx) throw new Error(`Bank transaction '${bankTransactionId}' not found.`);

    db.update(TABLES.BANK_TRANSACTIONS, bankTransactionId, {
      reconciliationStatus: 'unmatched',
      matchedSettlementId: null,
      matchType: null,
      matchScore: 0,
      notes: 'Manually unlinked.'
    });

    return { success: true, message: 'Transaction unlinked successfully.' };
  }
}

module.exports = ReconciliationMatcher;
