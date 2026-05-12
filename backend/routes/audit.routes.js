const express = require("express");
const router = express.Router();
const controller = require("../controllers/audit.controller");

router.get("/", controller.listAuditLogs);

module.exports = router;
