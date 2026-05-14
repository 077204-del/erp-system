const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getUserByUsername } = require("../services/finance/ledger.service");
const { writeRegisterUser } = require("../services/finance.write.service");
const { appendAudit } = require("../services/auditLog.service");
const {
  permissionsForLoginUser,
  normalizeRole,
} = require("../services/rbac.service");

function normalizePermissionMap(p = {}) {
  const src = p && typeof p === "object" ? p : {};
  return {
    canCreateSales: src.canCreateSales === true,
    canEditSales: src.canEditSales === true,
    canDeleteSales: src.canDeleteSales === true,
    canCreatePayments: src.canCreatePayments === true,
    canDeletePayments: src.canDeletePayments === true,
    canViewReports: src.canViewReports === true,
    canManageClients: src.canManageClients === true,
    canManageProducts: src.canManageProducts === true,
    canManageExpenses: src.canManageExpenses === true,
    canManageUsers: src.canManageUsers === true,
  };
}

// ======================
// REGISTER
// ======================
exports.register = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const safeRole = normalizeRole(role);

    const reg = await writeRegisterUser({
      username,
      password,
      role: safeRole,
    });
    if (!reg.ok) {
      return res.status(reg.status).json(reg.body);
    }

    const user = reg.user;

    appendAudit(
      {
        userId: user._id,
        action: "USER_REGISTERED",
        entityType: "User",
        entityId: user._id,
        meta: { username: user.username },
      },
      req
    );

    return res.status(201).json({
      message: "User created successfully",
      user: {
        id: String(user._id),
        username: user.username,
        role: normalizeRole(user.role),
        permissions: normalizePermissionMap(permissionsForLoginUser(user)),
      },
    });

  } catch (err) {
    console.log("REGISTER ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ======================
// LOGIN
// ======================
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await getUserByUsername(username);

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(400).json({ message: "Wrong password" });
    }

    const role = normalizeRole(user.role);
    const permissionsGranular = normalizePermissionMap(
      permissionsForLoginUser(user)
    );

    const token = jwt.sign(
      {
        id: user._id,
        role,
        permissions: permissionsGranular,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    appendAudit(
      {
        userId: user._id,
        action: "LOGIN_SUCCESS",
        entityType: "User",
        entityId: user._id,
        meta: { username: user.username },
      },
      req
    );

    return res.json({
      token,
      user: {
        id: String(user._id),
        username: user.username,
        role,
        permissions: permissionsGranular,
      },
    });

  } catch (err) {
    console.log("LOGIN ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
