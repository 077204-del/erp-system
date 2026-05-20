const express = require("express");
const router = express.Router();
const controller = require("../controllers/notifications.controller");

router.get("/unread-count", controller.getUnreadCount);
router.get("/", controller.listNotifications);

module.exports = router;
