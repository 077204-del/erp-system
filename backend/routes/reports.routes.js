const express = require("express");
const router = express.Router();
const controller = require("../controllers/reports.controller");

router.get("/", controller.getReports);

module.exports = router;
