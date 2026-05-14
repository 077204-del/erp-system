const express = require("express");
const router = express.Router();

const clientController = require("../controllers/client.controller");
const profileController = require("../controllers/client.profile.controller");
const timelineController = require("../controllers/client.timeline.controller"); // (future safe add)
const auth = require("../middleware/auth.middleware");

// ======================
// CLIENT CRUD
// ======================
router.get("/", auth(["admin", "manager", "cashier"]), clientController.getClients);

router.post("/", auth(["admin", "manager", "cashier", "canManageClients"]), clientController.createClient);
router.put("/:id", auth(["admin", "manager", "cashier", "canManageClients"]), clientController.updateClient);

// ======================
// SPECIFIC ROUTES (IMPORTANT ORDER)
// ======================

// PROFILE (advanced)
router.get("/:id/profile", auth(["admin", "manager", "cashier"]), profileController.getClientProfile);

// BALANCE
router.get("/:id/balance", auth(["admin", "manager", "cashier"]), clientController.getClientBalance);

// DEBT LEDGER (open / partial lines + totals from sales)
router.get("/:id/debt", auth(["admin", "manager", "cashier"]), clientController.getClientDebt);

// TIMELINE (future / optional)
router.get("/:id/timeline", auth(["admin", "manager", "cashier"]), timelineController?.getClientTimeline);

// ======================
// GENERIC ROUTE LAST (VERY IMPORTANT)
// ======================
router.get("/:id", auth(["admin", "manager", "cashier"]), clientController.getClient);

router.delete("/:id", auth(["admin", "manager", "cashier", "canManageClients"]), clientController.deleteClient);

module.exports = router;