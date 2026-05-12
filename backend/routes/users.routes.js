const express = require("express");
const router = express.Router();
const controller = require("../controllers/users.controller");

router.get("/", controller.listUsers);
router.post("/", controller.createUser);
router.patch("/:id/permissions", controller.updateUserPermissions);
router.delete("/:id", controller.deleteUser);

module.exports = router;
