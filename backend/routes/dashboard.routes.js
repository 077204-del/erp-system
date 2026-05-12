const express = require("express");
const router = express.Router();

const controller = require("../controllers/dashboard.controller");

// SAFETY CHECK
if (!controller || !controller.getDashboard) {
  throw new Error("Dashboard controller not loaded correctly");
}

router.get("/", controller.getDashboard);
router.get("/filtered", controller.getDashboardFiltered);

module.exports = router;