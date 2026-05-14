const router = require("express").Router();
const controller = require("../controllers/cash.session.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth(["admin", "manager"]), controller.getCashSession);

module.exports = router;