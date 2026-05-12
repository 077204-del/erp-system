function safeString(v, fallback = "") {
  if (v == null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

exports.getSettings = (req, res) => {
  try {
    return res.json({
      companyName: safeString(process.env.COMPANY_NAME, ""),
      environment: safeString(process.env.NODE_ENV, "development"),
      appVersion: safeString(process.env.APP_VERSION, "1.0.0"),
    });
  } catch (err) {
    return res.status(500).json({
      message: safeString(err.message, "Server error"),
      companyName: "",
      environment: "development",
      appVersion: "1.0.0",
    });
  }
};
