# Data stores

Barista keeps repository interfaces between application features and persistence. Drizzle ORM is
an implementation detail underneath those interfaces. SQLite is the local default; MySQL,
MariaDB, and PostgreSQL use their standard Node drivers (`mysql2` and `pg`). The selected remote
engine never falls back to SQLite if its connection is unavailable.

Preferences ▸ Data selects the engine, edits its connection, tests it, and shows migration and
integrity status. Passwords are encrypted with Electron `safeStorage` and are never returned to the
renderer.

Schemas live in `src/main/data/schema/`. Drizzle Kit generates a separate migration tree for each
dialect under `drizzle/`; run `npm run db:generate` after changing a schema. Startup applies pending
migrations. SQLite first copies the complete database file. Server engines first write a compressed
logical backup of the existing Barista tables into the user-data directory. The migration status
shows the backup path.

Serial allocation is deliberately dialect-specific. SQLite uses `BEGIN IMMEDIATE`; MySQL,
MariaDB, and PostgreSQL lock the counter row with `SELECT … FOR UPDATE` inside a transaction. No
generic read-then-write path is allowed for serials.

## Optional live contract tests

Normal `npm test` skips server suites when their connection URLs are absent. Docker is optional.
To exercise clean migrations, all repository contracts, and 1,000 serial values reserved by
concurrent calls on each server:

```powershell
npm run data:test:up
npm run test:data:servers
npm run data:test:down
```

The Compose stack is pinned in `docs/docker-compose.data.yml`, binds only test ports 33306, 33307,
and 35432, and stores database files in temporary in-memory filesystems. Override
`BARISTA_MYSQL_TEST_URL`, `BARISTA_MARIADB_TEST_URL`, or `BARISTA_POSTGRESQL_TEST_URL` to use other
test servers. Never point these destructive test suites at production databases.
