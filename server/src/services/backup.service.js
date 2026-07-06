// server/src/services/backup.service.js
// Backup Service — mongodump/mongorestore based backup system
// Encapsulates backup logic for CLI and programmatic use.
//
// Requirements: mongodump and mongorestore must be installed on the system.
// Install: MongoDB Database Tools (mongodb-database-tools package)

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const BACKUP_DIR = path.resolve(__dirname, '..', '..', 'backups');

class BackupService {

  /**
   * Create a full database backup using mongodump.
   * @param {object} [options]
   * @param {string} [options.uri] - MongoDB URI (defaults to process.env.MONGODB_URI)
   * @param {string} [options.customFilename] - Optional custom filename
   * @returns {Promise<{filename: string, path: string, size: number, createdAt: Date}>}
   * @throws {Error} If mongodump fails or URI is not set
   */
  static async createBackup(options = {}) {
    const uri = options.uri || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not set. Cannot create backup.');
    }

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const dbName = uri.split('/').pop().split('?')[0] || 'novastream';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = options.customFilename || `backup-${dbName}-${timestamp}.gz`;
    const outputPath = path.join(BACKUP_DIR, filename);

    logger.info({ dbName, output: outputPath }, 'Starting database backup');

    await this._runMongodump(uri, outputPath);

    const stats = fs.statSync(outputPath);

    logger.info({ filename, size: stats.size, dbName }, 'Database backup completed');

    return {
      filename,
      path: outputPath,
      size: stats.size,
      createdAt: new Date(),
    };
  }

  /**
   * List all available backups.
   * @returns {Promise<Array<{filename: string, path: string, size: number, createdAt: Date}>>}
   */
  static async listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.gz'))
      .sort()
      .reverse()
      .map(f => {
        const fullPath = path.join(BACKUP_DIR, f);
        try {
          const stats = fs.statSync(fullPath);
          return {
            filename: f,
            path: fullPath,
            size: stats.size,
            createdAt: stats.mtime,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return files;
  }

  /**
   * Restore a database backup using mongorestore.
   * @param {string} filename - Backup filename (from listBackups or full path)
   * @param {object} [options]
   * @param {string} [options.uri] - MongoDB URI (defaults to process.env.MONGODB_URI)
   * @param {boolean} [options.drop] - Drop existing collections before restore (default: true)
   * @returns {Promise<{filename: string, restoredAt: Date}>}
   * @throws {Error} If mongorestore fails or URI/filename not set
   */
  static async restoreBackup(filename, options = {}) {
    const uri = options.uri || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not set. Cannot restore backup.');
    }

    // Resolve path — could be just a filename or full path
    const backupPath = filename.startsWith('/') || filename.startsWith('.')
      ? path.resolve(filename)
      : path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    const drop = options.drop !== false; // Default: drop existing data

    logger.info({ backup: backupPath, drop }, 'Starting database restore');

    await this._runMongorestore(uri, backupPath, drop);

    logger.info({ backup: backupPath }, 'Database restore completed');

    return {
      filename: path.basename(backupPath),
      restoredAt: new Date(),
    };
  }

  /**
   * Get backup directory path.
   */
  static getBackupDir() {
    return BACKUP_DIR;
  }

  /**
   * Check if mongodump/mongorestore tools are available.
   * @returns {Promise<{mongodump: boolean, mongorestore: boolean}>}
   */
  static async checkTools() {
    const tools = { mongodump: false, mongorestore: false };

    try {
      await this._runCommand('mongodump', ['--version']);
      tools.mongodump = true;
    } catch {
      tools.mongodump = false;
    }

    try {
      await this._runCommand('mongorestore', ['--version']);
      tools.mongorestore = true;
    } catch {
      tools.mongorestore = false;
    }

    return tools;
  }

  // ── Private ──

  static _runMongodump(uri, outputPath) {
    return new Promise((resolve, reject) => {
      const args = [`--uri=${uri}`, `--archive=${outputPath}`, '--gzip'];
      const proc = spawn('mongodump', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.stdout.on('data', (data) => { stderr += data.toString(); }); // mongodump may output to stdout

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `mongodump exited with code ${code}`));
      });

      proc.on('error', (err) => reject(new Error(`mongodump not found. Install MongoDB Database Tools: ${err.message}`)));
    });
  }

  static _runMongorestore(uri, inputPath, drop) {
    return new Promise((resolve, reject) => {
      const args = [`--uri=${uri}`, `--archive=${inputPath}`, '--gzip'];
      if (drop) args.push('--drop');

      const proc = spawn('mongorestore', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.stdout.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `mongorestore exited with code ${code}`));
      });

      proc.on('error', (err) => reject(new Error(`mongorestore not found. Install MongoDB Database Tools: ${err.message}`)));
    });
  }

  static _runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: 'ignore' });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Exit code: ${code}`)));
      proc.on('error', reject);
    });
  }
}

module.exports = BackupService;
