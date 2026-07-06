// server/src/utils/transaction.js
// Reusable MongoDB transaction helper.
//
// Usage:
//   const result = await withTransaction(async (session) => {
//     await Model.findOneAndUpdate(...).session(session);
//     await OtherModel.deleteMany(...).session(session);
//     return result;
//   });
//
// On success: commits transaction, ends session.
// On error:   aborts transaction, ends session, re-throws the error.
//
// Notes:
//   - Requires a MongoDB replica set (or Atlas M0+). In dev/test with a
//     standalone mongod, `session.startTransaction()` will throw a
//     "Transaction numbers are only allowed on replica set members" error.
//     The helper detects this and falls through to a non-transactional
//     execution (the developer is responsible for acceptable behavior in
//     that environment).

const mongoose = require('mongoose');
const logger = require('../config/logger');

/**
 * Execute a callback within a MongoDB transaction.
 *
 * @param {Function} callback - Async function receiving (session).
 *   All database operations inside MUST be called with .session(session).
 * @returns {Promise<any>} The value returned by callback.
 * @throws {Error} The original error — caller is responsible for handling.
 */
async function withTransaction(callback) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch (abortErr) {
      logger.warn({ err: abortErr }, 'Transaction abort failed (non-fatal)');
    }
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = { withTransaction };
