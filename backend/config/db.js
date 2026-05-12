const mongoose = require("mongoose");

/**
 * Returns true if multi-document transactions are usable (replica set / sharded).
 * Session is always ended in finally.
 */
async function probeMongoTransactionsSupported() {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      /* probe only */
    });
    return true;
  } catch {
    return false;
  } finally {
    session.endSession();
  }
}

async function warnIfTransactionsUnsupported() {
  const ok = await probeMongoTransactionsSupported();
  if (!ok) {
    console.warn(
      "[ERP WARNING] MongoDB transactions require replica set (or sharded cluster). " +
        "Financial writes use strict multi-document transactions with no non-transaction fallback."
    );
  }
}

function requireMongoUri() {
  const uri = process.env.MONGO_URI;
  if (uri == null || !String(uri).trim()) {
    console.error(
      "MongoDB Error ❌ MONGO_URI is missing or empty. Set it in the environment (e.g. .env)."
    );
    console.error("[ERP startup] requireMongoUri: empty MONGO_URI (throwing)");
    throw new Error("MONGO_URI is missing or empty");
  }
}

const connectDB = async () => {
  console.error("[ERP startup] connectDB: validating MONGO_URI");
  requireMongoUri();
  try {
    console.error("[ERP startup] connectDB: calling mongoose.connect…");
    console.log("Trying to connect to MongoDB...");

    await mongoose.connect(String(process.env.MONGO_URI).trim(), {
      serverSelectionTimeoutMS: 30_000,
    });

    console.error("[ERP startup] connectDB: mongoose connected");
    console.log("MongoDB Connected ✅");
    await warnIfTransactionsUnsupported();
  } catch (error) {
    console.error(
      "[ERP startup] connectDB: mongoose.connect failed (throwing)",
      error && error.message ? error.message : error
    );
    console.error("MongoDB Error ❌", error && error.message);
    throw error;
  }
};

module.exports = connectDB;
module.exports.probeMongoTransactionsSupported = probeMongoTransactionsSupported;
module.exports.warnIfTransactionsUnsupported = warnIfTransactionsUnsupported;