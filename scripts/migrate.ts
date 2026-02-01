import { Database } from "bun:sqlite";

const dbPath = process.env.DB_PATH || "data/status.db";
const db = new Database(dbPath);

type Migration = {
  name: string;
  run: (db: Database) => void;
};

function makeDDriveSpaceNullable(db: Database): void {
  const tableInfo = db
    .prepare("PRAGMA table_info(machine_status)")
    .all() as Array<{ name: string; notnull: number }>;
  const dDriveCol = tableInfo.find((col) => col.name === "d_drive_space");

  if (dDriveCol && dDriveCol.notnull === 1) {
    db.run(`CREATE TABLE machine_status_new (
      machine TEXT NOT NULL PRIMARY KEY,
      timestamp DATETIME NOT NULL,
      c_drive_space REAL NOT NULL,
      d_drive_space REAL,
      last_email_sent DATETIME
    )`);
    db.run(`INSERT INTO machine_status_new SELECT * FROM machine_status`);
    db.run(`DROP TABLE machine_status`);
    db.run(`ALTER TABLE machine_status_new RENAME TO machine_status`);
  }
}

const migrations: Migration[] = [
  { name: "make-d-drive-space-nullable", run: makeDDriveSpaceNullable },
];

console.log(`Running migrations on ${dbPath}...`);

try {
  for (const migration of migrations) {
    console.log(`Running: ${migration.name}`);
    db.run("BEGIN TRANSACTION");
    migration.run(db);
    db.run("COMMIT");
    console.log(`✅ ${migration.name}`);
  }

  console.log("✅ All migrations completed successfully");
  db.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Migration failed:", error);
  try {
    db.run("ROLLBACK");
  } catch {}
  db.close();
  process.exit(1);
}
