const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const { appendAudit } = require("../services/auditLog.service");

function safeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v);
}

function createdAtFromUser(u) {
  if (u.createdAt instanceof Date && !Number.isNaN(u.createdAt.getTime())) {
    return u.createdAt.toISOString();
  }
  try {
    const id = u._id;
    if (id && typeof id.getTimestamp === "function") {
      const d = id.getTimestamp();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function normalizeRole(role) {
  return role === "admin" ? "admin" : "cashier";
}

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

function publicUser(u) {
  if (!u) return null;
  const raw = u.permissions;
  const permissions =
    raw != null && typeof raw === "object"
      ? normalizePermissionMap(raw)
      : null;
  return {
    id: String(u._id),
    username: safeString(u.username, ""),
    role: normalizeRole(u.role),
    permissions,
    createdAt: createdAtFromUser(u),
  };
}

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ username: 1 })
      .lean();

    const list = users.map((u) => publicUser(u));

    return res.json({ users: list });
  } catch (err) {
    return res.status(500).json({
      message: safeString(err.message, "Server error"),
      users: [],
    });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, role, permissions } = req.body;
    const uname = username != null ? String(username).trim() : "";
    if (!uname) {
      return res.status(400).json({ message: "username required" });
    }
    if (!password || String(password).length < 4) {
      return res
        .status(400)
        .json({ message: "password required (min 4 characters)" });
    }

    const safeRole = normalizeRole(role);

    const exists = await User.findOne({ username: uname }).lean();
    if (exists) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const hasExplicitPerms =
      permissions != null && typeof permissions === "object";
    const user = await User.create({
      username: uname,
      password: hash,
      role: safeRole,
      ...(hasExplicitPerms
        ? { permissions: normalizePermissionMap(permissions) }
        : {}),
    });

    const raw = user.toObject ? user.toObject() : { ...user };
    delete raw.password;

    return res.status(201).json({ user: publicUser(raw) });
  } catch (err) {
    return res.status(500).json({
      message: safeString(err.message, "Server error"),
    });
  }
};

exports.updateUserPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const target = await User.findById(id).lean();
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (String(target.role || "").toLowerCase() === "admin") {
      return res.status(400).json({
        message: "Admin role uses full access; permission map applies to cashiers only.",
      });
    }

    const perms = normalizePermissionMap(req.body);
    const updated = await User.findByIdAndUpdate(
      id,
      { $set: { permissions: perms } },
      { new: true, runValidators: true }
    )
      .select("-password")
      .lean();

    appendAudit(
      {
        userId: req.user.id,
        action: "USER_PERMISSIONS_UPDATED",
        entityType: "User",
        entityId: id,
        meta: { targetUsername: target.username, permissions: perms },
      },
      req
    );

    return res.json({ user: publicUser(updated) });
  } catch (err) {
    return res.status(500).json({
      message: safeString(err.message, "Server error"),
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const selfId = String(req.user.id || req.user._id || "");
    if (selfId && String(id) === selfId) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    const target = await User.findById(id).lean();
    if (target && target.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Cannot delete the last admin user",
        });
      }
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      ok: true,
      id: String(deleted._id),
    });
  } catch (err) {
    return res.status(500).json({
      message: safeString(err.message, "Server error"),
    });
  }
};
