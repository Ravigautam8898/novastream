// cli/commands/telegram.commands.js
const logger = require('../utils/logger');

async function setup() {
  logger.title('Telegram Bot Setup');
  logger.line();
  logger.info('Telegram integration is planned for Phase 7.');
  logger.info('When ready:');
  logger.empty();
  logger.data('1. Create a bot', 'Talk to @BotFather on Telegram');
  logger.data('2. Get token', 'BotFather will give you an API token');
  logger.data('3. Configure', 'Add TELEGRAM_BOT_TOKEN to .env file');
  logger.data('4. Authorize', 'Add TELEGRAM_ADMIN_IDS (comma-separated user IDs)');
  logger.empty();
  logger.warn('This feature is not yet implemented.');
  logger.info('Check docs/plans/SERVER_PLAN.md → Section 17 for full details.');
  logger.empty();
}

async function status() {
  logger.info('Telegram bot is not configured yet (Phase 7).');
}

async function testMsg() {
  logger.info('Telegram bot is not configured yet (Phase 7).');
}

module.exports = { setup, status, test: testMsg };
