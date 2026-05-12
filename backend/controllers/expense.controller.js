const Expense = require("../models/expense.model");
const {
  summaryForMonth,
  findExpensesFiltered,
} = require("../services/expenseQuery.service");

function parsePositiveAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function safeAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseExpenseDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function sanitizeLean(o) {
  if (!o) return null;
  let dateIso = null;
  if (o.date instanceof Date && !Number.isNaN(o.date.getTime())) {
    dateIso = o.date.toISOString();
  } else if (o.date) {
    const p = parseExpenseDate(o.date);
    dateIso = p && !Number.isNaN(p.getTime()) ? p.toISOString() : null;
  }
  return {
    id: String(o._id),
    type: o.type === "monthly" ? "monthly" : "daily",
    category: o.category != null ? String(o.category) : "",
    description: o.description != null ? String(o.description) : "",
    amount: safeAmount(o.amount),
    date: dateIso,
    createdBy: o.createdBy ? String(o.createdBy) : "",
    createdAt:
      o.createdAt instanceof Date && !Number.isNaN(o.createdAt.getTime())
        ? o.createdAt.toISOString()
        : null,
  };
}

exports.create = async (req, res) => {
  try {
    const { type, category, amount, description, date } = req.body;

    if (type !== "daily" && type !== "monthly") {
      return res.status(400).json({ message: "Invalid type" });
    }

    const amt = parsePositiveAmount(amount);
    if (!(amt > 0)) {
      return res.status(400).json({ message: "amount must be > 0" });
    }

    if (!description || !String(description).trim()) {
      return res.status(400).json({ message: "description required" });
    }

    const expenseDate = parseExpenseDate(date);
    if (!expenseDate || Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({ message: "valid date required" });
    }

    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const catRaw = category != null ? String(category).trim() : "";
    const categoryNorm = catRaw.length ? catRaw : "general";

    const doc = await Expense.create({
      type,
      category: categoryNorm,
      amount: amt,
      description: String(description).trim(),
      date: expenseDate,
      createdBy: userId,
    });

    return res.status(201).json(sanitizeLean(doc.toObject()));
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error",
    });
  }
};

exports.list = async (req, res) => {
  try {
    const { type, from, to } = req.query;
    const typeFilter =
      type === "daily" || type === "monthly" ? type : undefined;

    const docs = await findExpensesFiltered(
      typeFilter,
      from != null ? String(from) : "",
      to != null ? String(to) : ""
    );

    return res.json(docs.map((d) => sanitizeLean(d)));
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error",
    });
  }
};

exports.summary = async (req, res) => {
  try {
    let { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
      const d = new Date();
      month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    const out = await summaryForMonth(String(month));
    return res.json({
      totalDaily: out.totalDaily,
      totalMonthly: out.totalMonthly,
      totalExpenses: out.totalExpenses,
    });
  } catch (err) {
    return res.status(500).json({
      totalDaily: 0,
      totalMonthly: 0,
      totalExpenses: 0,
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const deleted = await Expense.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({ ok: true, id: String(deleted._id) });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error",
    });
  }
};
