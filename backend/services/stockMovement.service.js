const StockMovement = require("../models/stockMovement.model");

/**
 * Append-only stock ledger. Pass optional mongoose session for transactional writes.
 * @param {import('mongoose').ClientSession} [session]
 */
async function recordStockMovement(payload, session) {
  const doc = {
    productId: payload.productId,
    movementType: payload.movementType,
    qtyBefore: payload.qtyBefore,
    qtyChange: payload.qtyChange,
    qtyAfter: payload.qtyAfter,
    reason: payload.reason || payload.movementType,
    userId: payload.userId || null,
    saleId: payload.saleId || null,
  };

  const opts = session ? { session } : {};
  await StockMovement.create([doc], opts);
}

module.exports = { recordStockMovement };
