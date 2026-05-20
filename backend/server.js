console.log("[ERP BOOT STARTED]");

try {
  require("dotenv").config();
  console.log("[ERP BOOT] dotenv loaded");

  const {
    warnErpEnvironment,
    warnIfDeprecatedFinanceServiceLoaded,
  } = require("./config/erpStartupWarnings");
  warnErpEnvironment();
  console.log("[ERP BOOT] erpStartupWarnings loaded");

  const express = require("express");
  const cors = require("cors");

  const connectDB = require("./config/db");
  console.log("[ERP BOOT] connectDB module loaded");

  // ======================
  // ROUTES
  // ======================
  const productsRoutes = require("./routes/products.routes");
  const salesRoutes = require("./routes/sales.routes");
  const clientsRoutes = require("./routes/clients.routes");
  const paymentRoutes = require("./routes/payment.routes");
  const posRoutes = require("./routes/pos.routes");
  const clientStatementRoutes = require("./routes/client.statement.routes");
  const cashClosingRoutes = require("./routes/cash.closing.routes");
  const dashboardRoutes = require("./routes/dashboard.routes");
  const cashSessionRoutes = require("./routes/cash.session.routes");

  // 🔥 NEW: DAILY CLOSING ROUTE
  const dailyClosingRoutes = require("./routes/dailyClosing.routes");

  const usersRoutes = require("./routes/users.routes");
  const auditRoutes = require("./routes/audit.routes");
  const reportsRoutes = require("./routes/reports.routes");
  const settingsRoutes = require("./routes/settings.routes");
  const expenseRoutes = require("./routes/expense.routes");
  const notificationsRoutes = require("./routes/notifications.routes");
  const dailyRegisterController = require("./controllers/dailyRegister.controller");

  // ======================
  // AUTH
  // ======================
  const auth = require("./controllers/auth.controller");
  const authMiddleware = require("./middleware/auth.middleware");
  const protectedAuthMiddleware = authMiddleware(["admin", "manager", "cashier"]);
  const adminOnly = authMiddleware.allowRoles("admin");
  const reportsGate = authMiddleware(["admin", "manager", "cashier"]);

  console.log("[ERP BOOT] routes and auth modules loaded");

  const app = express();

  // ======================
  // MIDDLEWARE CORE (CORS before routes/auth — preflight must not hit JWT)
  // ======================
  const corsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
  // Express 5 / path-to-regexp: do not use app.options('*') or bare "*"
  // paths — they throw at boot. cors() on app.use handles preflight.
  app.use(cors(corsOptions));

  app.use((req, res, next) => {
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json());

  // 🔥 STRONG LOGGER
  app.use((req, res, next) => {
    console.log("➡️ ROUTE:", req.method, req.url);
    next();
  });

  // ======================
  // HEALTH CHECK
  // ======================
  app.get("/", (req, res) => {
    res.status(200).json({
      status: "OK",
      message: "ERP Backend Running",
    });
  });

  // ======================
  // AUTH ROUTES
  // ======================
  app.post("/api/auth/login", auth.login);
  app.post("/api/auth/register", auth.register);

  // ======================
  // PROTECTED ROUTES
  // ======================
  app.use(
    "/api/products",
    protectedAuthMiddleware,
    productsRoutes
  );

  app.use(
    "/api/sales",
    protectedAuthMiddleware,
    salesRoutes
  );

  app.use(
    "/api/clients",
    protectedAuthMiddleware,
    clientsRoutes
  );

  app.use(
    "/api/payments",
    protectedAuthMiddleware,
    paymentRoutes
  );

  app.use(
    "/api/pos",
    protectedAuthMiddleware,
    posRoutes
  );

  app.use(
    "/api/client-statement",
    protectedAuthMiddleware,
    clientStatementRoutes
  );

  app.use(
    "/api/cash-closing",
    protectedAuthMiddleware,
    cashClosingRoutes
  );

  app.use(
    "/api/dashboard",
    protectedAuthMiddleware,
    dashboardRoutes
  );

  app.use(
    "/api/cash-session",
    protectedAuthMiddleware,
    cashSessionRoutes
  );

  app.use(
    "/api/daily-closing",
    protectedAuthMiddleware,
    dailyClosingRoutes
  );

  app.use("/api/users", adminOnly, usersRoutes);

  app.use("/api/audit-logs", adminOnly, auditRoutes);

  app.get(
    "/api/reports/daily-register",
    protectedAuthMiddleware,
    reportsGate,
    dailyRegisterController.getDailyRegister
  );

  app.use("/api/reports", protectedAuthMiddleware, reportsGate, reportsRoutes);

  app.use("/api/settings", adminOnly, settingsRoutes);

  app.use("/api/expenses", protectedAuthMiddleware, expenseRoutes);

  app.use("/api/notifications", adminOnly, notificationsRoutes);

  // ======================
  // 404 HANDLER
  // ======================
  app.use((req, res) => {
    res.status(404).json({
      error: "Route not found",
      path: req.originalUrl,
    });
  });

  // ======================
  // ERROR HANDLER
  // ======================
  app.use((err, req, res, next) => {
    console.error("🔥 SERVER ERROR:", err);

    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  });

  // ======================
  // DB + START
  // ======================
  const PORT = process.env.PORT || 10000;
  const HOST = "0.0.0.0";

  process.on("error", (err) => {
    console.log("[ERP] process.on('error'):", err && err.message ? err.message : err);
    console.error("[ERP] process error:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.log("[ERP] unhandledRejection:", reason);
    console.error("[ERP] unhandledRejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.log(
      "[ERP] uncaughtException (logged only; process not exited):",
      err && err.message ? err.message : err
    );
    console.error(
      "[ERP] uncaughtException (logged only; process not exited):",
      err && err.stack ? err.stack : err
    );
  });

  console.log("[ERP BOOT] Express app wired; entering async startup (Mongo → listen)");

  (async () => {
    try {
      try {
        console.log("[ERP BOOT] DB connect start");
        await connectDB();
        console.log("[ERP BOOT] DB connect success");
      } catch (e) {
        console.log(
          "[ERP BOOT] DB connect fail (continuing degraded):",
          e && e.message ? e.message : e
        );
        console.error(
          "[ERP startup] Mongo unavailable; continuing to bind HTTP (degraded).",
          e && e.message ? e.message : e
        );
      }
      console.log(
        `[ERP BOOT] before app.listen host=${HOST} port=${PORT}`
      );
      const httpServer = app.listen(PORT, HOST, () => {
        console.log(`[ERP BOOT] after app.listen (listening) ${HOST}:${PORT}`);
        console.log(
          "[DEPLOY TRIGGER] ERP backend deployed successfully - build updated"
        );
        warnIfDeprecatedFinanceServiceLoaded();
        console.log(`Server running on ${HOST}:${PORT}`);
        let publicHint =
          process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "";
        if (!publicHint && process.env.RAILWAY_PUBLIC_DOMAIN) {
          const d = String(process.env.RAILWAY_PUBLIC_DOMAIN).trim();
          publicHint = d.startsWith("http") ? d : `https://${d}`;
        }
        if (publicHint) {
          console.log(`Public URL: ${publicHint}`);
        }
      });
      try {
        const { Server } = require("socket.io");
        const { attachAdminSocket } = require("./config/socketAdmin");
        const io = new Server(httpServer, {
          cors: { origin: "*", methods: ["GET", "POST"] },
        });
        attachAdminSocket(io);
        app.set("io", io);
        console.log("[ERP BOOT] Socket.IO ready (admins: room admins, event admin_notification)");
      } catch (sockErr) {
        console.warn(
          "[ERP BOOT] Socket.IO attach failed:",
          sockErr && sockErr.message ? sockErr.message : sockErr
        );
      }
      httpServer.on("error", (err) => {
        console.log("[ERP] HTTP server error:", err && err.message ? err.message : err);
        console.error("[ERP] HTTP server error:", err);
      });
    } catch (asyncBootErr) {
      console.log(
        "[ERP BOOT] async startup failed:",
        asyncBootErr && asyncBootErr.message ? asyncBootErr.message : asyncBootErr
      );
      console.error("[ERP BOOT] async startup failed:", asyncBootErr);
    }
  })();
} catch (bootErr) {
  console.log(
    "[ERP BOOT] synchronous startup failed:",
    bootErr && bootErr.message ? bootErr.message : bootErr
  );
  console.error("[ERP BOOT FATAL]", bootErr);
  throw bootErr;
}
