/**
 * Admin API module — all admin dashboard API methods.
 *
 * FE-005: All methods use async/await instead of .then() chains.
 * This ensures errors propagate through React's error handling
 * (error boundaries, try/catch in callers) instead of becoming
 * unhandled promise rejections from malformed responses.
 */
import apiClient from './client';

const extractData = (response) => response.data?.data ?? response.data;

export const adminApi = {
  // ── Stats & Health ──

  /** Get server overview statistics */
  getStats: async () => extractData(await apiClient.get('/admin/stats')),

  /** Get system health (CPU, memory, disk) */
  getSystemHealth: async () => extractData(await apiClient.get('/admin/system/health')),

  /** Get process info (PID, PM2 status) */
  getProcessInfo: async () => extractData(await apiClient.get('/admin/system/process')),

  // ── Users ──

  /** List all users */
  getUsers: async () => extractData(await apiClient.get('/admin/users')),

  /** Create a new user */
  createUser: async (data) => extractData(await apiClient.post('/admin/users', data)),

  /** Delete a user */
  deleteUser: async (id) => extractData(await apiClient.delete(`/admin/users/${id}`)),

  /** Reset user password */
  resetUserPassword: async (id, password) => extractData(await apiClient.post(`/admin/users/${id}/reset`, { password })),

  // ── Content ──

  /** List all content (paginated) */
  getContent: async (params) => (await apiClient.get('/admin/content', { params })).data,

  /** Update content fields */
  updateContent: async (id, data) => extractData(await apiClient.put(`/admin/content/${id}`, data)),

  /** Soft-delete content */
  deleteContent: async (id) => extractData(await apiClient.delete(`/admin/content/${id}`)),

  // ── Logs ──

  /** Get recent server logs */
  getLogs: async (lines = 50) => extractData(await apiClient.get('/admin/logs', { params: { lines } })),

  // ── Sessions ──

  /** Get active sessions */
  getSessions: async () => extractData(await apiClient.get('/admin/sessions')),

  /** Force-invalidate a session */
  deleteSession: async (id) => extractData(await apiClient.delete(`/admin/sessions/${id}`)),

  // ── Security (IPs) ──

  /** List blocked IPs */
  getBlockedIPs: async () => extractData(await apiClient.get('/admin/security/blocked-ips')),

  /** Block an IP */
  blockIP: async (data) => extractData(await apiClient.post('/admin/security/block-ip', data)),

  /** Unblock an IP */
  unblockIP: async (id) => extractData(await apiClient.post(`/admin/security/unblock-ip/${id}`)),

  // ── Database ──

  /** Get MongoDB stats */
  getDatabaseStats: async () => extractData(await apiClient.get('/admin/database')),

  // ── Config ──

  /** Get server config (masked) */
  getConfig: async () => extractData(await apiClient.get('/admin/config')),

  /** Validate .env integrity */
  validateConfig: async () => extractData(await apiClient.post('/admin/config/validate')),

  // ────────────
  //  Subscription Management
  // ────────────

  /** Assign subscription to a user */
  createSubscription: async (data) => extractData(await apiClient.post('/admin/subscriptions', data)),

  /** Get subscription status for a user */
  getSubscription: async (userId) => extractData(await apiClient.get(`/admin/subscriptions/${userId}`)),

  /** Get subscription audit history */
  getSubscriptionHistory: async (userId, params) => extractData(await apiClient.get(`/admin/subscriptions/${userId}/history`, { params })),

  /** Renew a subscription */
  renewSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/renew`, data)),

  /** Extend a subscription */
  extendSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/extend`, data)),

  /** Queue a plan upgrade (pending plan) */
  upgradeSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/upgrade`, data)),

  /** Cancel a pending plan upgrade */
  cancelUpgradeSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/cancel-upgrade`, data)),

  /** Suspend a subscription */
  suspendSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/suspend`, data)),

  /** Resume a subscription */
  resumeSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/resume`, data)),

  /** Activate a subscription */
  activateSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/activate`, data)),

  /** Deactivate a subscription */
  deactivateSubscription: async (userId, data) => extractData(await apiClient.put(`/admin/subscriptions/${userId}/deactivate`, data)),

  /** Expire a subscription immediately */
  expireSubscription: async (userId, data) => extractData(await apiClient.post(`/admin/subscriptions/${userId}/expire`, data)),

  /** Get global subscription stats */
  getSubscriptionStats: async () => extractData(await apiClient.get('/admin/subscriptions/stats')),

  /** Get expiring subscriptions */
  getExpiringSubscriptions: async (params) => extractData(await apiClient.get('/admin/subscriptions/expiring', { params })),

  /** Check subscription access for a user */
  checkSubscriptionAccess: async (userId) => extractData(await apiClient.get(`/admin/subscriptions/check/${userId}`)),

  /** Get available plans */
  getPlans: async (all) => extractData(await apiClient.get('/admin/subscriptions/plans', { params: { all: all ? 'true' : undefined } })),

  /** Get a specific plan */
  getPlan: async (planId) => extractData(await apiClient.get(`/admin/subscriptions/plans/${planId}`)),

  // ────────────
  //  Ownership
  // ────────────

  /** Transfer ownership of a user */
  transferOwnership: async (data) => extractData(await apiClient.put('/admin/ownership/transfer', data)),

  /** Batch transfer ownership */
  transferOwnershipBatch: async (data) => extractData(await apiClient.put('/admin/ownership/transfer-batch', data)),

  /** Transfer all members from a manager */
  transferAllOwnership: async (data) => extractData(await apiClient.put('/admin/ownership/transfer-all', data)),

  /** Get manager quota */
  getManagerQuota: async (managerId) => extractData(await apiClient.get(`/admin/ownership/managers/${managerId}/quota`)),

  /** Update manager quota */
  updateManagerQuota: async (managerId, data) => extractData(await apiClient.put(`/admin/ownership/managers/${managerId}/quota`, data)),

  // ────────────
  //  Plan Management
  // ────────────

  /** List all plans (admin) */
  listPlans: async (all) => extractData(await apiClient.get('/admin/subscription/plans', { params: { all: all ? 'true' : undefined } })),

  /** Get a single plan */
  getPlan: async (planId) => extractData(await apiClient.get(`/admin/subscription/plans/${planId}`)),

  /** Create a new plan */
  createPlan: async (data) => extractData(await apiClient.post('/admin/subscription/plans', data)),

  /** Update a plan */
  updatePlan: async (planId, data) => extractData(await apiClient.put(`/admin/subscription/plans/${planId}`, data)),

  /** Delete (deactivate) a plan */
  deletePlan: async (planId) => extractData(await apiClient.delete(`/admin/subscription/plans/${planId}`)),

  // ────────────
  //  System Settings
  // ────────────

  /** Get all system settings */
  getSettings: async () => extractData(await apiClient.get('/admin/ownership/settings')),

  /** Get a specific setting */
  getSetting: async (key) => extractData(await apiClient.get(`/admin/ownership/settings/${key}`)),

  /** Update a setting */
  updateSetting: async (key, data) => extractData(await apiClient.put(`/admin/ownership/settings/${key}`, data)),
};

export default adminApi;
