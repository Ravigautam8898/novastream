# NovaStream — Database Migrations

> **Location:** `server/migrations/`
>
> Every migration file must be:
> - **Versioned** — numbered sequentially (e.g. `001-initial-subscription.js`)
> - **Reversible** where possible — provide both `up()` and `down()` functions
> - **Logged** — record execution in the application logs

---

## Migration Rules

1. **Never modify existing migrations** after they've been applied to production
2. **Always provide a `down()` function** unless the migration is truly irreversible
3. **Test migrations** against a staging database before production
4. **Backup the database** before applying migrations to production

## Migration Format

```javascript
// server/migrations/XXX-description.js
// Run: node server/migrations/migrate.js up XXX
// Rollback: node server/migrations/migrate.js down XXX

const logger = require('../src/config/logger');

async function up(db) {
  // Apply migration
  logger.info({ migration: 'XXX-description' }, 'Applying migration...');
}

async function down(db) {
  // Rollback migration
  logger.info({ migration: 'XXX-description' }, 'Rolling back migration...');
}

module.exports = { up, down };
```

## Current Migrations

| # | Name | Description | Reversible | Applied |
|---|------|-------------|------------|---------|
| — | — | No migrations yet | — | — |
