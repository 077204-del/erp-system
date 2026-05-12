const express = require("express");
const router = express.Router();
const controller = require("../controllers/settings.controller");

router.get("/", controller.getSettings);

module.exports = router;
