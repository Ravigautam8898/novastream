// server/src/config/logger.js
// ✅ Pino structured logger
// - Development: pretty-printed with colors
// - Production: JSON output for log aggregation
// - Auto-redacts passwords, tokens, and cookies

const pino = require('pino');
const config = require('./env');

const logger = pino({
  level: config.server.logLevel,
  transport: config.server.isDevelopment
    ? {
        target: require.resolve('pino-pretty'),
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      }
    : undefined,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ip: req.ip,
      requestId: req.id,
      userAgent: req.headers?.['user-agent'],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.newPassword',
      'body.confirmPassword',
      'body.token',
      'body.accessToken',
    ],
    censor: '[REDACTED]',
  },
});

// Convenience child loggers
logger.api = (req) => logger.child({
  requestId: req.id || req.headers['x-request-id'],
  method: req.method,
  url: req.url,
});

module.exports = logger;
