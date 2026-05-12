const express = require("express");
const router = express.Router();

const controller = require("../controllers/dailyClosing.controller");
const auth = require("../middleware/auth.middleware");

// admin only
router.get("/", auth(["admin"]), controller.getDailyClosing);

module.exports = router;