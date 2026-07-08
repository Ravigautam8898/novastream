// cli/commands/external.commands.js
// novactl external commands — manage external content source status
//
// Commands:
//   novactl external status     Show sync status (mapped vs unmapped content)
//
// C5f: sync command removed — provider catalog sync has been replaced by
// MetadataRefreshScheduler which refreshes metadata cache without creating
// Content documents. Provider mapping scripts (attach providers[] to existing
// Content) are still valid and run separately.

const chalk = require('chalk');
const { loadEnv, findProjectRoot } = require('../utils/helpers');
const path = require('path');

async function status() {
  loadEnv();

  console.log('');
  console.log(chalk.cyan('  External Content Status'));
  console.log(chalk.gray('  ───────────────────────────────'));

  const spinner = ora('Checking sync status...').start();

  try {
    const mongoose = require('mongoose');
    const { MongoClient } = require('mongodb');

    const envPath = path.resolve(findProjectRoot(), '.env');
    require('dotenv').config({ path: envPath });

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      spinner.stop();
      console.log(chalk.red('  ✗ MONGODB_URI not set in .env'));
      process.exit(1);
    }

    // Use native MongoDB driver directly (avoids needing Mongoose models)
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();
    const contents = db.collection('contents');

    // Get counts using raw MongoDB aggregation
    const totalContent = await contents.countDocuments({ isActive: true });
    const mappedContent = await contents.countDocuments({
      sourceId: { $exists: true, $ne: null },
      sourceSite: { $exists: true, $ne: null },
      isActive: true,
    });
    const unmappedContent = totalContent - mappedContent;

    // Get source site breakdown
    const sourceSites = await contents.aggregate([
      { $match: { sourceSite: { $exists: true, $ne: null }, isActive: true } },
      { $group: { _id: '$sourceSite', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    // Get recently synced
    const recentlyUpdated = await contents
      .find({ sourceId: { $exists: true, $ne: null } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .project({ title: 1, sourceSite: 1, updatedAt: 1 })
      .toArray();

    // Get content type breakdown
    const typeBreakdown = await contents.aggregate([
      { $match: { sourceId: { $exists: true, $ne: null }, isActive: true } },
      { $group: { _id: '$contentType', count: { $sum: 1 } } },
    ]).toArray();

    await client.close();
    spinner.stop();

    // Display results
    console.log('');
    console.log(`  ${chalk.white('Total Active Content:')}   ${chalk.bold(totalContent)}`);
    console.log(`  ${chalk.green('✓ Mapped to Source:')}     ${chalk.bold(mappedContent)}`);
    console.log(`  ${chalk.yellow('Unmapped:')}               ${chalk.bold(unmappedContent)}`);
    console.log('');

    if (sourceSites.length > 0) {
      console.log(chalk.gray('  Source Sites:'));
      for (const site of sourceSites) {
        console.log(`    ${chalk.cyan('◉')} ${site._id}: ${chalk.bold(site.count)} items`);
      }
      console.log('');
    }

    if (typeBreakdown.length > 0) {
      console.log(chalk.gray('  Content Type:'));
      for (const type of typeBreakdown) {
        const label = type._id === 'movie' ? 'Movies' : 'Series';
        console.log(`    ${chalk.cyan('◉')} ${label}: ${chalk.bold(type.count)} items`);
      }
      console.log('');
    }

    if (recentlyUpdated.length > 0) {
      console.log(chalk.gray('  Recently Synced:'));
      for (const item of recentlyUpdated) {
        const time = item.updatedAt
          ? new Date(item.updatedAt).toLocaleDateString()
          : 'N/A';
        console.log(`    ${chalk.dim('•')} ${item.title} ${chalk.dim(`(${time})`)}`);
      }
      console.log('');
    }

    console.log(chalk.green('  ✓ Status check complete'));
    console.log('');

  } catch (err) {
    spinner.stop();
    console.error(chalk.red(`  ✗ Status check failed: ${err.message}`));
    process.exit(1);
  }
}

module.exports = { status };
