const express = require("express");
const router = express.Router();

const controller = require("../controllers/cash.closing.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth(["admin", "manager"]), controller.getCashClosing);

module.exports = router;