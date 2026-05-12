const express = require("express");
const router = express.Router();

const controller = require("../controllers/client.statement.controller");
const auth = require("../middleware/auth.middleware");

router.get("/:id", auth(["admin", "cashier"]), controller.getClientStatement);

module.exports = router;