# CLAUDE.md

## Business Context

This project is part of an automation suite for an unmanned simulator golf facility with 8 hitting bays. The goal is to provide a seamless, self-service experience for guests — including newcomers — with minimal staff intervention. Each bay runs a Windows PC powering the golf simulator, and keeping those machines healthy is critical to uptime and guest satisfaction.

## Project Overview

sig-status is a disk space monitoring and alerting system for the facility's bay PCs. It tracks drive storage (C: and D: drives) on each machine, stores metrics in SQLite, and sends email alerts when disk space falls below configurable thresholds. Includes an HTML dashboard and daily summary reports. This allows operators to be notified of issues remotely before they impact guests.

## Tech Stack

- **Runtime**: Bun (with built-in SQLite)
- **Language**: TypeScript
- **Web Framework**: Hono
- **Email**: Nodemailer (Gmail SMTP)
- **CSS**: Bulma (for HTML reports)

## Commands

```bash
bun install          # Install dependencies
bun run index.ts     # Start the server (port 3004)
```

## Project Structure

- `index.ts` - Entry point, delegates to `src/index.ts`
- `src/app.ts` - `MonitoringApp` class with HTTP routes and threshold logic
- `src/config.ts` - Configuration loader (thresholds, port, env vars)
- `src/types.ts` - TypeScript interfaces
- `src/GmailEmailService.ts` - Email sending via Gmail SMTP
- `src/SqliteStatusReporter.ts` - SQLite database operations
- `src/html-report.ts` - HTML dashboard generation
- `data/status.db` - SQLite database (auto-created, gitignored)

## Key Endpoints

- `POST /status` - Receive disk space data from a machine (accepts camelCase and snake_case)
- `GET /status` - JSON array of all machines' latest status
- `GET /status/:machine` - Single machine status
- `GET /status.html` - HTML dashboard

## Configuration

Required environment variables (via `.env`):

- `GMAIL_USER` - Gmail account for sending alerts
- `GMAIL_PASSWORD` - Gmail app-specific password
- `RECIPIENT_EMAIL` - Alert recipient(s), comma-separated for multiple

Hardcoded in `config.ts`:

- Port: 3004
- Soft threshold: 30 GB (warning email, 24h reminder interval)
- Hard threshold: 10 GB (critical email, 1h reminder interval)

## Deployment

The app runs on port 3004 and is exposed via a Caddy reverse proxy at `https://app.swedenindoorgolf.se/sig-status/`. The bay PCs send requests to this public URL (e.g. `POST https://app.swedenindoorgolf.se/sig-status/status`). The dashboard is at `https://app.swedenindoorgolf.se/sig-status/status.html`.

This service participates in a shared deployment system (managed in the `sig-infra` repo). The deploy system handles:
- Downloading the production SQLite DB locally
- Running migrations and validation against the local copy
- Uploading the migrated DB if validation passes
- Deploying new code and restarting the service
- Automatic rollback of both DB and code on failure

Configuration for this is in `deploy.json`. See the "Database Migrations" section below for how to add schema changes.

## Database Migrations

Database schema changes are handled via `scripts/migrate.ts`, executed by the deploy system *before* new code is deployed. This allows testing migrations against a local copy of the production DB before anything goes live.

- **Migration script**: `scripts/migrate.ts` — run via `bun run db:migrate`
- **Validation script**: `scripts/health.ts` — run via `bun run db:health`
- **Deploy config**: `deploy.json` — tells the deploy system where the DB is and what commands to run

### Adding a new migration

1. Write a named function in `scripts/migrate.ts`:
   ```typescript
   function addSomeColumn(db: Database): void {
     const columns = db.prepare("PRAGMA table_info(machine_status)").all() as Array<{ name: string }>;
     if (!columns.some((c) => c.name === "some_column")) {
       db.run("ALTER TABLE machine_status ADD COLUMN some_column TEXT");
     }
   }
   ```
2. Append it to the `migrations` array:
   ```typescript
   const migrations: Migration[] = [
     { name: "make-d-drive-space-nullable", run: makeDDriveSpaceNullable },
     { name: "add-some-column", run: addSomeColumn },
   ];
   ```
3. Update `scripts/health.ts` to validate the new schema.
4. Update the `CREATE TABLE IF NOT EXISTS` in `src/SqliteStatusReporter.ts` so fresh databases get the correct schema.
5. Test locally: `db_pull && db_migrate_test && db_validate_test`

Migrations must be **idempotent** (safe to run multiple times). Each migration runs in its own transaction. Do NOT put migration logic in application startup code — it belongs only in `scripts/migrate.ts`.

## Git Commits

Do not include `Co-Authored-By` lines in commit messages.

## Architecture Notes

- Services use interface-based DI (EmailService, StatusRepository)
- Email rate limiting prevents spam: hard threshold reminders every 1h, soft every 24h
- Daily report runs on a 24h interval timer
- Some email text is in Swedish
