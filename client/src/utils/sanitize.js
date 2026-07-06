// client/src/utils/sanitize.js
// Client-side input sanitization utility using DOMPurify
// Prevents XSS attacks by stripping malicious HTML/scripts from user inputs

import DOMPurify from 'dompurify';

/**
 * Sanitize a string value — strips HTML tags and scripts
 * Safe for display in the DOM (innerHTML, dangerouslySetInnerHTML)
 *
 * @param {string} value - The raw input string
 * @param {object} options - DOMPurify options
 * @returns {string} Sanitized safe string
 */
export function sanitizeHtml(value, options = {}) {
  if (typeof value !== 'string') return '';
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],           // Strip all HTML tags by default
    ALLOWED_ATTR: [],           // Strip all attributes
    ...options,
  }).trim();
}

/**
 * Sanitize a string for safe use in URLs (search queries, etc.)
 * Removes HTML and trims whitespace
 *
 * @param {string} value - The raw input string
 * @returns {string} Sanitized safe string
 */
export function sanitizeSearchInput(value) {
  if (typeof value !== 'string') return '';
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
    .trim()
    .slice(0, 200);  // Enforce max length
}

export default DOMPurify;
