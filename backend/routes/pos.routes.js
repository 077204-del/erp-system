const router = require("express").Router();

// TEST ONLY
router.get("/", (req, res) => {
  res.json({ message: "POS WORKING" });
});

module.exports = router;