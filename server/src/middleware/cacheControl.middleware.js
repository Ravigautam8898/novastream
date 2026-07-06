// server/src/middleware/cacheControl.middleware.js
// Cache-Control header middleware
// Sets Cache-Control on read-only GET responses so browsers can cache API data
// and avoid re-fetching on back-navigation.

/**
 * Returns a middleware that sets Cache-Control headers on successful GET responses.
 *
 * @param {string|Object} options - Either a directive string like 'public, max-age=300'
 *   or an options object with { maxAge, public, sMaxage, staleWhileRevalidate }
 * @returns {Function} Express middleware
 */
function cacheControl(options = {}) {
  // Resolve the Cache-Control value
  let headerValue;

  if (typeof options === 'string') {
    headerValue = options;
  } else {
    const {
      maxAge = 300,         // 5 minutes browser cache
      public: isPublic = true,
      sMaxage,               // separate CDN / shared cache time
      staleWhileRevalidate = 60,  // serve stale while revalidating in background
    } = options;

    const parts = [];
    parts.push(isPublic ? 'public' : 'private');
    parts.push(`max-age=${maxAge}`);
    if (sMaxage !== undefined) parts.push(`s-maxage=${sMaxage}`);
    if (staleWhileRevalidate !== undefined) {
      parts.push(`stale-while-revalidate=${staleWhileRevalidate}`);
    }
    headerValue = parts.join(', ');
  }

  return function cacheControlMiddleware(req, res, next) {
    // Only apply to GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Store the original json/send methods so we can intercept successful responses
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function (body) {
      // Only cache successful responses (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.set('Cache-Control', headerValue);
      }
      return originalJson(body);
    };

    res.send = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.set('Cache-Control', headerValue);
      }
      return originalSend(body);
    };

    next();
  };
}

module.exports = cacheControl;
