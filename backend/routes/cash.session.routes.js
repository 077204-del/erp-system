const router = require("express").Router();
const controller = require("../controllers/cash.session.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth(["admin"]), controller.getCashSession);

module.exports = router;