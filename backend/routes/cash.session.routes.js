const router = require("express").Router();
const controller = require("../controllers/cash.Session.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth(["admin"]), controller.getCashSession);

module.exports = router;