// server/src/config/roles.js
// Role constants, permission definitions, and helper functions
// Reference: SUBSCRIPTION_SYSTEM_v3.md §3 — User Roles, §4 — Permission Matrix

// ── Role Constants ──

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  MANAGER: 'manager',
  MEMBER: 'member',
};

// Legacy role mapping for backward compatibility
//   admin → super_admin
//   user  → member
const LEGACY_ROLE_MAP = {
  admin: ROLES.SUPER_ADMIN,
  user: ROLES.MEMBER,
};

// ── Role Hierarchy ──
// Higher index = more privileges
const ROLE_HIERARCHY = [
  ROLES.MEMBER,
  ROLES.MANAGER,
  ROLES.SUPER_ADMIN,
];

// ── Permission Matrix ──
// Each role has a set of allowed actions.
// Super Admin inherits all permissions.
// Manager inherits Member permissions + admin-scoped actions.
// Member has only consumer permissions.

const PERMISSIONS = {
  // ── Consumer (Member) Permissions ──
  [ROLES.MEMBER]: [
    'auth:login',
    'auth:logout',
    'content:browse',
    'content:watch',
    'content:search',
    'profile:view',
    'profile:update',
  ],

  // ── Manager Permissions ──
  [ROLES.MANAGER]: [
    'auth:login',
    'auth:logout',
    'content:browse',
    'content:watch',
    'content:search',
    'profile:view',
    'profile:update',
    'admin:access',
    'admin:users:create_member',
    'admin:users:view_own',
    'admin:users:manage_own',
    'admin:users:reset_password_own',
    'admin:subscriptions:assign',
    'admin:subscriptions:renew',
    'admin:subscriptions:extend',
    'admin:subscriptions:suspend',
    'admin:subscriptions:resume',
    'admin:subscriptions:activate',
    'admin:subscriptions:deactivate',
    'admin:subscriptions:expire',
    'admin:subscriptions:view_own',
    'admin:subscriptions:history_own',
    'admin:dashboard:own_stats',
  ],

  // ── Super Admin Permissions ──
  [ROLES.SUPER_ADMIN]: [
    'auth:login',
    'auth:logout',
    'content:browse',
    'content:watch',
    'content:search',
    'profile:view',
    'profile:update',
    'admin:access',
    'admin:users:create_super_admin',
    'admin:users:create_manager',
    'admin:users:create_member',
    'admin:users:view_all',
    'admin:users:manage_all',
    'admin:users:delete',
    'admin:users:reset_password_any',
    'admin:subscriptions:assign',
    'admin:subscriptions:renew',
    'admin:subscriptions:extend',
    'admin:subscriptions:suspend',
    'admin:subscriptions:resume',
    'admin:subscriptions:activate',
    'admin:subscriptions:deactivate',
    'admin:subscriptions:expire',
    'admin:subscriptions:dates',
    'admin:subscriptions:view_all',
    'admin:subscriptions:history_all',
    'admin:subscriptions:stats',
    'admin:dashboard:global',
    'admin:ownership:transfer',
    'admin:ownership:transfer_batch',
    'admin:ownership:transfer_all',
    'admin:managers:manage',
    'admin:managers:quotas',
    'admin:settings:view',
    'admin:settings:manage',
    'admin:security:manage',
    'admin:content:manage',
    'admin:system:health',
    'admin:system:logs',
    'admin:audit:view_all',
    'system:bypass_subscription',
    'system:bypass_ownership',
    'system:bypass_quota',
  ],
};

// ── Helper Functions ──

/**
 * Check if a role has a specific permission.
 * @param {string} role - Role name (supports legacy admin/user mapping)
 * @param {string} permission - Permission string (e.g., 'admin:users:create_member')
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  const normalized = normalizeRole(role);
  const permissions = PERMISSIONS[normalized];
  return permissions ? permissions.includes(permission) : false;
}

/**
 * Normalize a role name, mapping legacy roles to new ones.
 * @param {string} role - Raw role value from JWT or DB
 * @returns {string} Normalized role name
 */
function normalizeRole(role) {
  if (!role) return ROLES.MEMBER;
  return LEGACY_ROLE_MAP[role] || role;
}

/**
 * Check if a role is an admin-level role (can access /api/admin/*).
 * @param {string} role
 * @returns {boolean}
 */
function isAdminRole(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLES.SUPER_ADMIN || normalized === ROLES.MANAGER;
}

/**
 * Check if a role requires subscription checks.
 * @param {string} role
 * @returns {boolean}
 */
function requiresSubscription(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLES.MEMBER;
}

/**
 * Check if a role can create another role.
 * @param {string} actorRole - The role creating the user
 * @param {string} targetRole - The role being created
 * @returns {boolean}
 */
function canCreateRole(actorRole, targetRole) {
  const normalizedActor = normalizeRole(actorRole);
  const normalizedTarget = normalizeRole(targetRole);

  if (normalizedActor === ROLES.SUPER_ADMIN) {
    return true; // Super Admin can create any role
  }

  if (normalizedActor === ROLES.MANAGER) {
    return normalizedTarget === ROLES.MEMBER; // Manager can only create Members
  }

  return false; // Member cannot create any role
}

/**
 * Get role hierarchy level (higher = more privileged).
 * @param {string} role
 * @returns {number} Index in hierarchy array
 */
function getRoleLevel(role) {
  const normalized = normalizeRole(role);
  return ROLE_HIERARCHY.indexOf(normalized);
}

/**
 * Check if an actor role outranks a target role.
 * @param {string} actorRole - Role of the user performing the action
 * @param {string} targetRole - Role of the target user
 * @returns {boolean}
 */
function outranks(actorRole, targetRole) {
  return getRoleLevel(actorRole) > getRoleLevel(targetRole);
}

/**
 * Check if actor can manage target (equal or higher rank, unless same role for admins).
 * Super Admin can manage anyone. Manager can manage only Members.
 * @param {string} actorRole
 * @param {string} targetRole
 * @returns {boolean}
 */
function canManage(actorRole, targetRole) {
  const normalizedActor = normalizeRole(actorRole);
  const normalizedTarget = normalizeRole(targetRole);

  if (normalizedActor === ROLES.SUPER_ADMIN) return true;
  if (normalizedActor === ROLES.MANAGER) return normalizedTarget === ROLES.MEMBER;
  return false;
}

// ── Validation ──

const VALID_ROLES = Object.values(ROLES);
const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.MANAGER];

/**
 * Check if a role string is a valid role.
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

module.exports = {
  ROLES,
  LEGACY_ROLE_MAP,
  PERMISSIONS,
  ROLE_HIERARCHY,
  VALID_ROLES,
  ADMIN_ROLES,
  hasPermission,
  normalizeRole,
  isAdminRole,
  requiresSubscription,
  canCreateRole,
  getRoleLevel,
  outranks,
  canManage,
  isValidRole,
};
