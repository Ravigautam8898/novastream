// server/src/validators/auth.validator.js
// Zod schemas for authentication request validation

const { z } = require('zod');

/**
 * Login request schema
 * - username: 3-50 chars, alphanumeric + underscore
 * - password: 6-100 chars
 */
const loginSchema = z.object({
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters'),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(100, 'Password must be at most 100 characters'),
  }),
});

/**
 * Create user schema (admin only)
 * - username: 3-50 chars, alphanumeric + underscore only
 * - password: 6-100 chars
 * - role: optional, defaults to 'user'
 */
const createUserSchema = z.object({
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters')
      .regex(
        /^[a-zA-Z0-9_]+$/,
        'Username can only contain letters, numbers, and underscores'
      ),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(100, 'Password must be at most 100 characters'),
    role: z.enum(['super_admin', 'manager', 'member']).optional().default('member'),
  }),
});

/**
 * Change password schema
 */
const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(6, 'New password must be at least 6 characters')
      .max(100, 'New password must be at most 100 characters'),
  }),
});

/**
 * Logout schema — expects authorization header, but body is optional
 */
const logoutSchema = z.object({
  body: z.object({
    allDevices: z.boolean().optional().default(false),
  }),
});

module.exports = {
  loginSchema,
  createUserSchema,
  changePasswordSchema,
  logoutSchema,
};
