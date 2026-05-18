/**
 * Unified financial write pipeline: sale creation and payments against sales.
 * Keeps Sale.paidAmount, Sale.debt, Payment rows, and Client.totalDebt aligned.
 *
 * All persistence runs inside MongoDB multi-document transactions (requires
 * replica set or sharded cluster). On any failure, changes roll back together.
 *
 * MongoDB schemas and HTTP contracts stay defined by controllers; this module
 * only encodes the internal rules once.
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Sale = require("../models/sale.model");
const Payment = require("../models/payment.model");
const Product = require("../models/product.model");
const Client = require("../models/client.model");
const User = require("../models/user.model");
const { getClientBalance } = require("./finance/ledger.service");
const { recordStockMovement } = require("./stockMovement.service");

class WriteFlowError extends Error {
  constructor(status, body) {
    super(body?.message || "WriteFlowError");
    this.name = "WriteFlowError";
    this.status = status;
    this.body = body;
  }
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Multi-document financial writes: all work(session) runs inside withTransaction.
 * Commits only if the callback resolves; aborts on throw. session.endSession is always in finally.
 */
async function runWriteTransaction(work) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => work(session));
  } catch (err) {
    if (err instanceof WriteFlowError) {
      return { ok: false, status: err.status, body: err.body };
    }
    throw err;
  } finally {
    session.endSession();
  }
  return { ok: true };
}

/** Per-client queue so concurrent writeSyncClientDebtCache calls serialize (no overlap, no re-entry storms). */
const _clientDebtSyncChains = new Map();

function _runSerializedForClient(clientKey, fn) {
  const prev = _clientDebtSyncChains.get(clientKey) || Promise.resolve();
  const next = prev.then(fn, fn);
  _clientDebtSyncChains.set(
    clientKey,
    next.then(
      () => {},
      () => {}
    )
  );
  return next;
}

/**
 * Sale.paymentMethod uses CASH | CARD | DEBT; Payment.method uses CASH | CARD | BANK.
 */
function paymentMethodForInflow(salePaymentMethod, paidAmount) {
  if (num(paidAmount) <= 0) return "CASH";
  if (salePaymentMethod === "CARD") return "CARD";
  if (salePaymentMethod === "BANK") return "BANK";
  // DEBT or unknown: money physically in (down payment) — treat as CASH in ledger
  return "CASH";
}

function saleStatusFromAmounts(total, paidAmount, debt) {
  const t = num(total);
  const p = num(paidAmount);
  const d = num(debt);

  if (d <= 0 || p >= t) return "PAID";
  if (p > 0) return "PARTIAL";
  return "DEBT";
}

/**
 * Reconcile Client.totalDebt (cache) to ledger truth: sum(Sale.total) − sum(Payment.amount).
 * All persistence for this cache belongs in the write service, not the ledger.
 *
 * Not recursive: getClientBalance (ledger) performs reads only and never calls this module.
 * Concurrent callers for the same client are serialized to avoid lost updates / double-sync races.
 */
async function writeSyncClientDebtCache(clientId) {
  if (clientId == null || clientId === "") {
    return { ok: true };
  }

  const id = clientId.toString ? clientId.toString() : String(clientId);

  return _runSerializedForClient(id, async () => {
    const [client, balance] = await Promise.all([
      Client.findById(id),
      getClientBalance(id),
    ]);

    if (!client) {
      return { ok: false, status: 404, body: { message: "Client not found" } };
    }

    client.totalDebt = balance.balance;
    await client.save();

    return { ok: true, client, balance };
  });
}

/**
 * Create a sale line, decrement stock, optional Payment for money in at sale time,
 * and bump client debt by remaining balance.
 *
 * @param {object} input
 * @param {string} input.productId
 * @param {string} input.clientId
 * @param {number} input.quantity
 * @param {number} [input.paidAmount]
 * @param {string} [input.paymentMethod]
 * @param {string} input.cashierId
 * @returns {Promise<{ ok: true, sale } | { ok: false, status: number, body: object }>}
 */
async function writeCreateSale(input) {
  const {
    productId,
    clientId,
    quantity,
    paidAmount: paidAmountInput = 0,
    paymentMethod: paymentMethodInput = "CASH",
    cashierId,
    negotiatedUnitPrice,
    paymentType,
  } = input;

  if (!clientId || clientId === "") {
    return {
      ok: false,
      status: 400,
      body: { message: "Client is required" },
    };
  }

  if (!productId || quantity == null) {
    return {
      ok: false,
      status: 400,
      body: { message: "Missing product or quantity" },
    };
  }

  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid quantity" },
    };
  }

  let saleOut = null;

  const txnResult = await runWriteTransaction(async (session) => {
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw new WriteFlowError(404, { message: "Product not found" });
    }

    const client = await Client.findById(clientId).session(session);
    if (!client) {
      throw new WriteFlowError(404, { message: "Client not found" });
    }

    const qtyBefore = num(product.qty);
    if (qtyBefore < qty) {
      throw new WriteFlowError(400, {
        message: "Not enough stock",
        code: "INSUFFICIENT_STOCK",
        available: qtyBefore,
      });
    }

    const listPrice = num(product.salePrice);
    const negotiated = num(negotiatedUnitPrice);
    let unitPrice = listPrice;
    if (Number.isFinite(negotiated) && negotiated > 0) {
      unitPrice = negotiated;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new WriteFlowError(400, { message: "Invalid unit price" });
    }
    if (unitPrice > 1e15) {
      unitPrice = 1e15;
    }
    const total = unitPrice * qty;

    let paymentMethod = paymentMethodInput;
    let paid = num(paidAmountInput);
    let ptype =
      paymentType != null ? String(paymentType).toLowerCase() : null;

    if (!ptype) {
      if (total <= 0) {
        ptype = "credit";
        paid = 0;
      } else if (paid <= 0) {
        ptype = "credit";
      } else if (paid >= total) {
        ptype = "cash";
      } else {
        ptype = "partial";
      }
    }

    if (ptype === "cash") {
      paid = total;
      if (paymentMethod !== "CARD") paymentMethod = "CASH";
    } else if (ptype === "credit") {
      paid = 0;
      paymentMethod = "DEBT";
    } else if (ptype === "partial") {
      paid = num(paidAmountInput);
      paymentMethod = "CASH";
    }

    if (paid < 0) paid = 0;
    if (paid > total) paid = total;

    if (ptype === "partial" && (paid <= 0 || paid >= total)) {
      throw new WriteFlowError(400, {
        message: "Partial payment requires paidAmount strictly between 0 and line total",
      });
    }

    const debt = Math.max(total - paid, 0);
    const finalStatus = saleStatusFromAmounts(total, paid, debt);

    const [sale] = await Sale.create(
      [
        {
          productId,
          clientId,
          cashierId,
          quantity: qty,
          unitPrice,
          total,
          paidAmount: paid,
          debt,
          status: finalStatus,
          profit: 0,
          paymentMethod,
          saleDate: new Date(),
        },
      ],
      { session }
    );

    const dec = await Product.updateOne(
      { _id: productId, qty: { $gte: qty } },
      { $inc: { qty: -qty } },
      { session }
    );

    if (dec.modifiedCount !== 1) {
      const snap = await Product.findById(productId).session(session).lean();
      throw new WriteFlowError(400, {
        message: "Not enough stock",
        code: "INSUFFICIENT_STOCK",
        available: snap != null ? num(snap.qty) : 0,
      });
    }

    await recordStockMovement(
      {
        productId,
        movementType: "SALE_OUT",
        qtyBefore,
        qtyChange: -qty,
        qtyAfter: qtyBefore - qty,
        userId: cashierId,
        saleId: sale._id,
        reason: "SALE_OUT",
      },
      session
    );

    if (paid > 0) {
      await Payment.create(
        [
          {
            clientId: sale.clientId,
            saleId: sale._id,
            amount: paid,
            type: "SALE_PAYMENT",
            method: paymentMethodForInflow(paymentMethod, paid),
            recordedAt: sale.saleDate || new Date(),
          },
        ],
        { session }
      );
    }

    client.totalDebt = num(client.totalDebt) + debt;
    await client.save({ session });

    saleOut = sale;
  });

  if (!txnResult.ok) {
    return txnResult;
  }

  const syncRes = await writeSyncClientDebtCache(clientId);
  if (!syncRes.ok) {
    console.error("[ERP CACHE DRIFT RISK] writeCreateSale committed but cache sync failed", {
      clientId: String(clientId),
      saleId: saleOut?._id ? String(saleOut._id) : null,
      ...syncRes.body,
    });
    return {
      ok: false,
      status: syncRes.status || 500,
      body: syncRes.body || { message: "Failed to sync client debt cache" },
    };
  }

  return { ok: true, sale: saleOut };
}

/**
 * Replace a sale line (same _id, same saleDate / cashierId) when at most one
 * payment row exists for the sale. Reverses prior stock, reapplies new line
 * stock and financials, then rebuilds the single initial SALE_PAYMENT if any.
 */
async function writeUpdateSaleById(saleId, input, userId = null) {
  const {
    productId,
    clientId,
    quantity,
    paidAmount: paidAmountInput = 0,
    paymentMethod: paymentMethodInput = "CASH",
    negotiatedUnitPrice,
    agreedUnitPrice,
    paymentType,
  } = input;

  const negotiated =
    negotiatedUnitPrice != null ? negotiatedUnitPrice : agreedUnitPrice;

  if (!clientId || clientId === "") {
    return {
      ok: false,
      status: 400,
      body: { message: "Client is required" },
    };
  }

  if (!productId || quantity == null) {
    return {
      ok: false,
      status: 400,
      body: { message: "Missing product or quantity" },
    };
  }

  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid quantity" },
    };
  }

  let saleOut = null;
  const syncClientIds = new Set();

  const txnResult = await runWriteTransaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) {
      throw new WriteFlowError(404, { message: "Sale not found" });
    }

    if (sale.voided === true || String(sale.status || "") === "VOID") {
      throw new WriteFlowError(400, {
        message: "Cannot edit a voided sale",
        code: "SALE_VOIDED",
      });
    }

    if (sale.clientId) {
      syncClientIds.add(String(sale.clientId));
    }

    const linkedPayments = await Payment.find({ saleId: sale._id })
      .session(session)
      .lean();
    if (linkedPayments.length > 1) {
      throw new WriteFlowError(400, {
        message:
          "Cannot edit this sale because multiple payments are linked to it. Record a correction or void the sale instead.",
        code: "SALE_EDIT_PAYMENT_CONFLICT",
      });
    }
    if (linkedPayments.length === 1) {
      const p0 = linkedPayments[0];
      if (Math.abs(num(p0.amount) - num(sale.paidAmount)) > 0.01) {
        throw new WriteFlowError(400, {
          message:
            "Recorded payments do not match this sale line; editing is blocked for safety.",
          code: "SALE_EDIT_PAYMENT_MISMATCH",
        });
      }
    }

    await Payment.deleteMany({ saleId: sale._id }, { session });

    const oldProductId = sale.productId;
    const oldQty = num(sale.quantity);

    const oldProduct = await Product.findById(oldProductId).session(session);
    if (!oldProduct) {
      throw new WriteFlowError(404, { message: "Original product not found" });
    }

    const oldProdQtyBefore = num(oldProduct.qty);
    oldProduct.qty = oldProdQtyBefore + oldQty;
    await oldProduct.save({ session });

    await recordStockMovement(
      {
        productId: oldProductId,
        movementType: "MANUAL_ADD",
        qtyBefore: oldProdQtyBefore,
        qtyChange: oldQty,
        qtyAfter: oldProdQtyBefore + oldQty,
        userId: userId || null,
        saleId: sale._id,
        reason: "SALE_EDIT_RESTORE",
      },
      session
    );

    const newProduct = await Product.findById(productId).session(session);
    if (!newProduct) {
      throw new WriteFlowError(404, { message: "Product not found" });
    }

    const newProdQtyBefore = num(newProduct.qty);
    if (newProdQtyBefore < qty) {
      throw new WriteFlowError(400, {
        message: "Not enough stock",
        code: "INSUFFICIENT_STOCK",
        available: newProdQtyBefore,
      });
    }

    const listPrice = num(newProduct.salePrice);
    const neg = num(negotiated);
    let unitPrice = listPrice;
    if (Number.isFinite(neg) && neg > 0) {
      unitPrice = neg;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new WriteFlowError(400, { message: "Invalid unit price" });
    }
    if (unitPrice > 1e15) {
      unitPrice = 1e15;
    }

    const total = unitPrice * qty;

    let paymentMethod = paymentMethodInput;
    let paid = num(paidAmountInput);
    let ptype =
      paymentType != null ? String(paymentType).toLowerCase() : null;

    if (!ptype) {
      if (total <= 0) {
        ptype = "credit";
        paid = 0;
      } else if (paid <= 0) {
        ptype = "credit";
      } else if (paid >= total) {
        ptype = "cash";
      } else {
        ptype = "partial";
      }
    }

    if (ptype === "cash") {
      paid = total;
      if (paymentMethod !== "CARD") paymentMethod = "CASH";
    } else if (ptype === "credit") {
      paid = 0;
      paymentMethod = "DEBT";
    } else if (ptype === "partial") {
      paid = num(paidAmountInput);
      paymentMethod = "CASH";
    }

    if (paid < 0) paid = 0;
    if (paid > total) paid = total;

    if (ptype === "partial" && (paid <= 0 || paid >= total)) {
      throw new WriteFlowError(400, {
        message:
          "Partial payment requires paidAmount strictly between 0 and line total",
      });
    }

    const debt = Math.max(total - paid, 0);
    const finalStatus = saleStatusFromAmounts(total, paid, debt);
    const dec = await Product.updateOne(
      { _id: productId, qty: { $gte: qty } },
      { $inc: { qty: -qty } },
      { session }
    );

    if (dec.modifiedCount !== 1) {
      const snap = await Product.findById(productId).session(session).lean();
      throw new WriteFlowError(400, {
        message: "Not enough stock",
        code: "INSUFFICIENT_STOCK",
        available: snap != null ? num(snap.qty) : 0,
      });
    }

    await recordStockMovement(
      {
        productId,
        movementType: "SALE_OUT",
        qtyBefore: newProdQtyBefore,
        qtyChange: -qty,
        qtyAfter: newProdQtyBefore - qty,
        userId: userId || null,
        saleId: sale._id,
        reason: "SALE_OUT",
      },
      session
    );

    sale.productId = productId;
    sale.clientId = clientId;
    sale.quantity = qty;
    sale.unitPrice = unitPrice;
    sale.total = total;
    sale.paidAmount = paid;
    sale.debt = debt;
    sale.status = finalStatus;
    sale.profit = 0;
    sale.paymentMethod = paymentMethod;

    await sale.save({ session });

    if (paid > 0) {
      await Payment.create(
        [
          {
            clientId: sale.clientId,
            saleId: sale._id,
            amount: paid,
            type: "SALE_PAYMENT",
            method: paymentMethodForInflow(paymentMethod, paid),
            recordedAt: sale.saleDate || new Date(),
          },
        ],
        { session }
      );
    }

    if (sale.clientId) {
      syncClientIds.add(String(sale.clientId));
    }

    saleOut = sale;
  });

  if (!txnResult.ok) {
    return txnResult;
  }

  for (const cid of syncClientIds) {
    const syncRes = await writeSyncClientDebtCache(cid);
    if (!syncRes.ok) {
      console.error(
        "[ERP CACHE DRIFT RISK] writeUpdateSaleById committed but cache sync failed",
        { clientId: cid, saleId: String(saleId), ...syncRes.body }
      );
      return {
        ok: false,
        status: syncRes.status || 500,
        body: syncRes.body || { message: "Failed to sync client debt cache" },
      };
    }
  }

  return { ok: true, sale: saleOut };
}

/**
 * Apply a payment to a sale: Payment row + Sale amounts + Client.totalDebt.
 * Caps to current sale.debt (same as legacy paySale). Rejects zero/negative effective amount.
 *
 * @param {object} input
 * @param {string} input.saleId
 * @param {number} input.amount
 * @param {string} [input.method] Payment.method — default CASH (legacy paySale)
 * @param {string} [input.type] default SALE_PAYMENT
 * @returns {Promise<
 *   | { ok: true, payment, sale }
 *   | { ok: false, status: number, body: object }
 * >}
 */
async function writeApplyPaymentToSale(input) {
  const {
    saleId,
    amount,
    method = "CASH",
    type = "SALE_PAYMENT",
    recordedAt = null,
  } = input;

  let paymentAmount = num(amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid payment amount" },
    };
  }

  let paymentOut = null;
  let saleOut = null;

  const txnResult = await runWriteTransaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) {
      throw new WriteFlowError(404, { message: "Sale not found" });
    }

    if (sale.voided === true || String(sale.status || "") === "VOID") {
      throw new WriteFlowError(400, {
        message: "Cannot pay a voided sale",
        code: "SALE_VOIDED",
      });
    }

    const outstanding = num(sale.debt);
    paymentAmount = Math.min(paymentAmount, outstanding);

    if (paymentAmount <= 0) {
      throw new WriteFlowError(400, {
        message: "No outstanding debt on this sale",
      });
    }

    const resolvedMethod =
      method === "CARD" || method === "BANK" || method === "CASH"
        ? method
        : "CASH";

    const when =
      recordedAt != null && recordedAt !== ""
        ? new Date(recordedAt)
        : new Date();
    if (Number.isNaN(when.getTime())) {
      throw new WriteFlowError(400, { message: "Invalid payment date" });
    }

    const [payment] = await Payment.create(
      [
        {
          clientId: sale.clientId,
          saleId: sale._id,
          amount: paymentAmount,
          type,
          method: resolvedMethod,
          recordedAt: when,
        },
      ],
      { session }
    );

    sale.paidAmount = num(sale.paidAmount) + paymentAmount;
    sale.debt = Math.max(num(sale.total) - sale.paidAmount, 0);
    sale.status = saleStatusFromAmounts(
      sale.total,
      sale.paidAmount,
      sale.debt
    );

    await sale.save({ session });

    if (sale.clientId) {
      const client = await Client.findById(sale.clientId).session(session);
      if (client) {
        client.totalDebt = Math.max(num(client.totalDebt) - paymentAmount, 0);
        await client.save({ session });
      }
    }

    paymentOut = payment;
    saleOut = sale;
  });

  if (!txnResult.ok) {
    return txnResult;
  }

  if (saleOut.clientId) {
    const syncRes = await writeSyncClientDebtCache(saleOut.clientId);
    if (!syncRes.ok) {
      console.error(
        "[ERP CACHE DRIFT RISK] writeApplyPaymentToSale committed but cache sync failed",
        {
          clientId: String(saleOut.clientId),
          saleId: saleOut?._id ? String(saleOut._id) : null,
          ...syncRes.body,
        }
      );
      return {
        ok: false,
        status: syncRes.status || 500,
        body:
          syncRes.body || { message: "Failed to sync client debt cache" },
      };
    }
  }

  return { ok: true, payment: paymentOut, sale: saleOut };
}

/**
 * Apply a payment across one or more open sale lines for a client (FIFO by saleDate).
 * If saleId is set, that sale is paid first when it still has debt; otherwise allocation
 * starts with the oldest open lines.
 */
async function writeApplyClientDebtPayment(input) {
  const {
    clientId,
    amount,
    method = "CASH",
    type = "SALE_PAYMENT",
    saleId = null,
    recordedAt = null,
  } = input;

  let paymentAmount = num(amount);
  if (!clientId || isNaN(paymentAmount) || paymentAmount <= 0) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid client or payment amount" },
    };
  }

  const resolvedMethod =
    method === "CARD" || method === "BANK" || method === "CASH"
      ? method
      : "CASH";

  const when =
    recordedAt != null && recordedAt !== ""
      ? new Date(recordedAt)
      : new Date();
  if (Number.isNaN(when.getTime())) {
    return {
      ok: false,
      status: 400,
      body: { message: "Invalid payment date" },
    };
  }

  const cid = clientId.toString ? clientId.toString() : String(clientId);
  const paymentsOut = [];
  const salesOut = [];
  let totalApplied = 0;

  const txnResult = await runWriteTransaction(async (session) => {
    const client = await Client.findById(cid).session(session);
    if (!client) {
      throw new WriteFlowError(404, { message: "Client not found" });
    }

    let queue = [];

    if (saleId) {
      const primary = await Sale.findById(saleId).session(session);
      if (!primary) {
        throw new WriteFlowError(404, { message: "Sale not found" });
      }
      if (primary.voided === true || String(primary.status || "") === "VOID") {
        throw new WriteFlowError(400, {
          message: "Cannot apply payment to a voided sale",
          code: "SALE_VOIDED",
        });
      }
      if (String(primary.clientId) !== cid) {
        throw new WriteFlowError(400, {
          message: "Sale does not belong to this client",
        });
      }
      const rest = await Sale.find({
        clientId: cid,
        debt: { $gt: 0 },
        voided: { $ne: true },
        _id: { $ne: primary._id },
      })
        .sort({ saleDate: 1, createdAt: 1 })
        .session(session);

      queue = num(primary.debt) > 0 ? [primary, ...rest] : [...rest];
    } else {
      queue = await Sale.find({
        clientId: cid,
        debt: { $gt: 0 },
        voided: { $ne: true },
      })
        .sort({ saleDate: 1, createdAt: 1 })
        .session(session);
    }

    if (!queue.length) {
      throw new WriteFlowError(400, {
        message: "No outstanding debt for this client",
      });
    }

    let remaining = paymentAmount;

    for (const sale of queue) {
      if (remaining <= 0) break;
      const outstanding = num(sale.debt);
      if (outstanding <= 0) continue;
      const apply = Math.min(remaining, outstanding);

      const [paymentDoc] = await Payment.create(
        [
          {
            clientId: sale.clientId,
            saleId: sale._id,
            amount: apply,
            type,
            method: resolvedMethod,
            recordedAt: when,
          },
        ],
        { session }
      );

      sale.paidAmount = num(sale.paidAmount) + apply;
      sale.debt = Math.max(num(sale.total) - sale.paidAmount, 0);
      sale.status = saleStatusFromAmounts(
        sale.total,
        sale.paidAmount,
        sale.debt
      );
      await sale.save({ session });

      paymentsOut.push(paymentDoc);
      salesOut.push(sale);
      totalApplied += apply;
      remaining -= apply;
    }

    if (remaining > 1e-6) {
      throw new WriteFlowError(400, {
        message:
          "Payment amount exceeds total outstanding debt for this client",
        excess: remaining,
      });
    }

    if (totalApplied > 0) {
      client.totalDebt = Math.max(num(client.totalDebt) - totalApplied, 0);
      await client.save({ session });
    }
  });

  if (!txnResult.ok) {
    return txnResult;
  }

  const syncRes = await writeSyncClientDebtCache(cid);
  if (!syncRes.ok) {
    console.error(
      "[ERP CACHE DRIFT RISK] writeApplyClientDebtPayment committed but cache sync failed",
      { clientId: cid, ...syncRes.body }
    );
    return {
      ok: false,
      status: syncRes.status || 500,
      body: syncRes.body || { message: "Failed to sync client debt cache" },
    };
  }

  return {
    ok: true,
    payments: paymentsOut,
    sales: salesOut,
    appliedAmount: totalApplied,
  };
}

async function writeVoidSaleById(saleId, userId, reason) {
  const reasonStr =
    reason != null && String(reason).trim() ? String(reason).trim() : "";
  if (!reasonStr) {
    return {
      ok: false,
      status: 400,
      body: { message: "Void reason is required" },
    };
  }

  let clientIdForSync = null;

  const txnResult = await runWriteTransaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) {
      throw new WriteFlowError(404, { message: "Sale not found" });
    }
    if (sale.voided === true || String(sale.status || "") === "VOID") {
      throw new WriteFlowError(400, {
        message: "Sale is already voided",
        code: "SALE_ALREADY_VOIDED",
      });
    }
    clientIdForSync = sale.clientId;

    await Payment.deleteMany({ saleId: sale._id }, { session });

    const product = await Product.findById(sale.productId).session(session);
    if (!product) {
      throw new WriteFlowError(404, { message: "Product not found" });
    }

    const qtyBefore = num(product.qty);
    const qty = num(sale.quantity);
    product.qty = qtyBefore + qty;
    await product.save({ session });

    await recordStockMovement(
      {
        productId: sale.productId,
        movementType: "MANUAL_ADD",
        qtyBefore,
        qtyChange: qty,
        qtyAfter: qtyBefore + qty,
        userId: userId || null,
        saleId: sale._id,
        reason: "SALE_VOID",
      },
      session
    );

    sale.voidSnapshot = {
      total: num(sale.total),
      paidAmount: num(sale.paidAmount),
      debt: num(sale.debt),
      quantity: num(sale.quantity),
      unitPrice: num(sale.unitPrice),
      profit: num(sale.profit),
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      productId: sale.productId,
      clientId: sale.clientId,
    };

    sale.total = 0;
    sale.paidAmount = 0;
    sale.debt = 0;
    sale.profit = 0;
    sale.quantity = 0;
    sale.unitPrice = 0;
    sale.status = "VOID";
    sale.paymentMethod = "CASH";
    sale.voided = true;
    sale.voidedAt = new Date();
    sale.voidedBy = userId || null;
    sale.voidReason = reasonStr;

    await sale.save({ session });
  });

  if (!txnResult.ok) {
    return txnResult;
  }

  if (clientIdForSync) {
    const syncRes = await writeSyncClientDebtCache(clientIdForSync);
    if (!syncRes.ok) {
      return {
        ok: false,
        status: syncRes.status || 500,
        body:
          syncRes.body || { message: "Failed to sync client debt cache" },
      };
    }
  }

  return { ok: true };
}

async function writeDeletePaymentById(paymentId) {
  let clientIdForSync = null;

  const txnResult = await runWriteTransaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) {
      throw new WriteFlowError(404, { message: "Payment not found" });
    }
    clientIdForSync = payment.clientId;
    const amt = num(payment.amount);

    if (payment.saleId) {
      const sale = await Sale.findById(payment.saleId).session(session);
      if (
        sale &&
        sale.voided !== true &&
        String(sale.status || "") !== "VOID"
      ) {
        sale.paidAmount = Math.max(num(sale.paidAmount) - amt, 0);
        sale.debt = Math.max(num(sale.total) - sale.paidAmount, 0);
        sale.status = saleStatusFromAmounts(
          sale.total,
          sale.paidAmount,
          sale.debt
        );
        await sale.save({ session });
      }
    }

    await Payment.deleteOne({ _id: payment._id }).session(session);
  });

  if (!txnResult.ok) {
    return txnResult;
  }

  if (clientIdForSync) {
    const syncRes = await writeSyncClientDebtCache(clientIdForSync);
    if (!syncRes.ok) {
      return {
        ok: false,
        status: syncRes.status || 500,
        body:
          syncRes.body || { message: "Failed to sync client debt cache" },
      };
    }
  }

  return { ok: true };
}

/**
 * Master data / catalog writes: each API maps to a single MongoDB write (atomic per document).
 * Multi-document atomicity is enforced for financial writes via runWriteTransaction.
 */
async function writeCreateClient(data) {
  return Client.create(data);
}

async function writeDeleteClientById(id) {
  return Client.findByIdAndDelete(id);
}

async function writeCreateProduct(data, userId) {
  const product = await Product.create(data);
  const q0 = num(product.qty);
  await recordStockMovement({
    productId: product._id,
    movementType: "PRODUCT_CREATE",
    qtyBefore: 0,
    qtyChange: q0,
    qtyAfter: q0,
    userId: userId || null,
    reason: "PRODUCT_CREATE",
  });
  return product;
}

async function writeDeleteProductById(id) {
  return Product.findByIdAndDelete(id);
}

async function writeUpdateProductStockById(id, qty, userId) {
  const newQty = Number(qty);
  if (!Number.isFinite(newQty) || newQty < 0) {
    return {
      ok: false,
      status: 400,
      body: { message: "Stock quantity cannot be negative" },
    };
  }

  const product = await Product.findById(id);
  if (!product) {
    return { ok: false, status: 404, body: { message: "Product not found" } };
  }

  const qtyBefore = num(product.qty);
  if (qtyBefore === newQty) {
    return { ok: true, product };
  }

  product.qty = newQty;
  await product.save();

  const delta = newQty - qtyBefore;
  const movementType = delta > 0 ? "MANUAL_ADD" : "MANUAL_REMOVE";
  await recordStockMovement({
    productId: product._id,
    movementType,
    qtyBefore,
    qtyChange: delta,
    qtyAfter: newQty,
    userId: userId || null,
    reason: movementType,
  });

  return { ok: true, product };
}

async function writeUpdateProductById(
  id,
  { name, qty, salePrice, costPrice, barcode, category, lowStockThreshold },
  userId
) {
  const product = await Product.findById(id);
  if (!product) {
    return null;
  }
  const qtyBefore = num(product.qty);
  product.name = name ?? product.name;
  product.qty = qty ?? product.qty;
  product.salePrice = salePrice ?? product.salePrice;
  product.costPrice = costPrice ?? product.costPrice;
  if (barcode !== undefined) product.barcode = barcode;
  if (category !== undefined) product.category = category;
  if (lowStockThreshold !== undefined) product.lowStockThreshold = lowStockThreshold;
  await product.save();

  const newQty = num(product.qty);
  if (userId && newQty !== qtyBefore) {
    const delta = newQty - qtyBefore;
    const movementType = delta > 0 ? "MANUAL_ADD" : "MANUAL_REMOVE";
    await recordStockMovement({
      productId: product._id,
      movementType,
      qtyBefore,
      qtyChange: delta,
      qtyAfter: newQty,
      userId,
      reason: movementType,
    });
  }

  return product;
}

async function writeRegisterUser({ username, password, role }) {
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return {
      ok: false,
      status: 400,
      body: { message: "User already exists" },
    };
  }

  const hashed = await bcrypt.hash(password, 10);
  const r = String(role || "").trim().toLowerCase();
  const safeRole =
    r === "admin" || r === "manager" || r === "cashier" ? r : "cashier";
  const user = await User.create({
    username,
    password: hashed,
    role: safeRole,
  });

  return { ok: true, user };
}

module.exports = {
  writeCreateSale,
  writeUpdateSaleById,
  writeApplyPaymentToSale,
  writeApplyClientDebtPayment,
  writeVoidSaleById,
  writeDeletePaymentById,
  writeSyncClientDebtCache,
  writeCreateClient,
  writeDeleteClientById,
  writeCreateProduct,
  writeDeleteProductById,
  writeUpdateProductStockById,
  writeUpdateProductById,
  writeRegisterUser,
  paymentMethodForInflow,
  saleStatusFromAmounts,
};
