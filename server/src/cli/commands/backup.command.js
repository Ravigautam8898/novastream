// server/src/cli/commands/backup.command.js
// Backup / Restore — mongodump-based backup system
// Backups stored in server/backups/ directory

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const c = (color, text) => colors[color] + text + colors.reset;

const BACKUP_DIR = path.resolve(__dirname, '..', '..', '..', 'backups');

async function show(rl) {
  // Ensure backup dir exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  while (true) {
    console.clear();
    console.log(c('cyan', '\n╔══════════════════════════════════════════╗'));
    console.log(c('cyan', '║         Backup / Restore                 ║'));
    console.log(c('cyan', '╚══════════════════════════════════════════╝\n'));

    console.log('  [1] Create Backup');
    console.log('  [2] List Backups');
    console.log('  [3] Restore Backup');
    console.log('  [4] Back to Main Menu\n');

    const choice = await ask(rl, '  Choose: ');

    switch (choice.trim()) {
      case '1':
        await createBackup(rl);
        break;
      case '2':
        await listBackups();
        break;
      case '3':
        await restoreBackup(rl);
        break;
      case '4':
        return;
      default:
        console.log(c('red', '\n  ❌ Invalid option.\n'));
    }

    if (choice.trim() !== '4') {
      await ask(rl, c('dim', '\n  Press Enter to continue...'));
    }
  }
}

async function createBackup(rl) {
  console.log(c('bright', '\n  💾 Create Backup\n'));

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log(c('red', '  ❌ MONGODB_URI not set in environment.\n'));
    return;
  }

  // Parse MongoDB URI to extract database name
  const dbName = mongoUri.split('/').pop().split('?')[0] || 'novastream';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `backup-${dbName}-${timestamp}.gz`;
  const backupPath = path.join(BACKUP_DIR, filename);

  console.log(`  Database: ${dbName}`);
  console.log(`  Output:   ${backupPath}`);
  console.log(c('yellow', '\n  ⚠️  mongodump must be installed on this system.\n'));

  const confirm = await ask(rl, '  Proceed with backup? (yes/no): ');
  if (confirm.trim().toLowerCase() !== 'yes') {
    console.log(c('yellow', '  Cancelled.\n'));
    return;
  }

  console.log(c('yellow', '\n  ⏳ Creating backup... This may take a while.\n'));

  try {
    await runMongodump(mongoUri, backupPath);
    const stats = fs.statSync(backupPath);
    console.log(c('green', `\n  ✅ Backup created successfully!`));
    console.log(c('dim', `     File:     ${filename}`));
    console.log(c('dim', `     Size:     ${formatBytes(stats.size)}`));
    console.log('');
  } catch (err) {
    console.log(c('red', `\n  ❌ Backup failed: ${err.message}`));
    console.log(c('yellow', '  Make sure mongodump is installed and MONGODB_URI is accessible.\n'));
    // Clean up partial file
    try { fs.unlinkSync(backupPath); } catch {}
  }
}

async function listBackups() {
  console.log(c('bright', '\n  📂 Available Backups\n'));

  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      console.log('  No backups directory found.\n');
      return;
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.gz'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.log('  No backups found.\n');
      return;
    }

    console.log(`  Directory: ${BACKUP_DIR}\n`);
    const header = `  ${'File'.padEnd(50)} ${'Size'.padEnd(12)} ${'Date'.padEnd(20)}`;
    console.log(c('dim', header));
    console.log(c('dim', '  ' + '-'.repeat(80)));
    for (const f of files) {
      const fullPath = path.join(BACKUP_DIR, f);
      try {
        const stats = fs.statSync(fullPath);
        const size = formatBytes(stats.size);
        const date = new Date(stats.mtime).toLocaleDateString();
        console.log(`  ${f.padEnd(50)} ${size.padEnd(12)} ${date.padEnd(20)}`);
      } catch {
        console.log(`  ${f.padEnd(50)} ${'Error'.padEnd(12)}`);
      }
    }
    console.log(`\n  Total: ${files.length} backup(s)\n`);
  } catch (err) {
    console.log(c('red', `  ❌ Failed to list backups: ${err.message}\n`));
  }
}

async function restoreBackup(rl) {
  console.log(c('bright', '\n  🔄 Restore Backup\n'));

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log(c('red', '  ❌ MONGODB_URI not set in environment.\n'));
    return;
  }

  // List backups
  const files = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.gz')).sort().reverse()
    : [];

  if (files.length === 0) {
    console.log(c('yellow', '  No backups available to restore.\n'));
    return;
  }

  console.log('  Available backups:\n');
  for (let i = 0; i < Math.min(files.length, 10); i++) {
    console.log(`  [${i + 1}] ${files[i]}`);
  }
  console.log('');

  const idx = parseInt(await ask(rl, '  Enter backup number to restore: '), 10);
  if (isNaN(idx) || idx < 1 || idx > files.length) {
    console.log(c('red', '  ❌ Invalid selection.\n'));
    return;
  }

  const selectedFile = files[idx - 1];
  const backupPath = path.join(BACKUP_DIR, selectedFile);

  if (!fs.existsSync(backupPath)) {
    console.log(c('red', '  ❌ Backup file not found.\n'));
    return;
  }

  const dbName = mongoUri.split('/').pop().split('?')[0] || 'novastream';

  console.log(c('red', `\n  ⚠️  WARNING: This will REPLACE the current database '${dbName}'!`));
  console.log(c('red', '  All existing data will be overwritten.\n'));

  const confirm1 = await ask(rl, `  Type 'RESTORE' to confirm: `);
  if (confirm1.trim() !== 'RESTORE') {
    console.log(c('yellow', '  Restore cancelled.\n'));
    return;
  }

  const confirm2 = await ask(rl, c('red', `  Are you absolutely sure? This cannot be undone. (yes/no): `));
  if (confirm2.trim().toLowerCase() !== 'yes') {
    console.log(c('yellow', '  Restore cancelled.\n'));
    return;
  }

  console.log(c('yellow', '\n  ⏳ Restoring backup...\n'));

  try {
    await runMongorestore(mongoUri, backupPath);
    console.log(c('green', '\n  ✅ Backup restored successfully!\n'));
  } catch (err) {
    console.log(c('red', `\n  ❌ Restore failed: ${err.message}`));
    console.log(c('yellow', '  Make sure mongorestore is installed and the backup file is valid.\n'));
  }
}

function runMongodump(uri, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [`--uri=${uri}`, `--archive=${outputPath}`, '--gzip'];
    const proc = spawn('mongodump', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `mongodump exited with code ${code}`));
    });

    proc.on('error', (err) => reject(new Error(`mongodump not found: ${err.message}`)));
  });
}

function runMongorestore(uri, inputPath) {
  return new Promise((resolve, reject) => {
    const args = [`--uri=${uri}`, `--archive=${inputPath}`, '--gzip', '--drop'];
    const proc = spawn('mongorestore', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `mongorestore exited with code ${code}`));
    });

    proc.on('error', (err) => reject(new Error(`mongorestore not found: ${err.message}`)));
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

module.exports = { show };
