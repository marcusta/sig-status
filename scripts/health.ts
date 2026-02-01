import { Database } from "bun:sqlite";

const dbPath = process.env.DB_PATH || "data/status.db";
const db = new Database(dbPath);

console.log(`Validating database schema at ${dbPath}...`);

try {
  db.query("SELECT 1").get();

  // Check machine_status table exists
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];
  const tableNames = tables.map((t) => t.name);

  if (!tableNames.includes("machine_status")) {
    throw new Error("Missing required table: machine_status");
  }

  // Verify column schema
  const columns = db
    .prepare("PRAGMA table_info(machine_status)")
    .all() as Array<{ name: string; notnull: number; type: string }>;

  const requiredColumns = [
    "machine",
    "timestamp",
    "c_drive_space",
    "d_drive_space",
    "last_email_sent",
  ];

  for (const col of requiredColumns) {
    if (!columns.some((c) => c.name === col)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }

  // Verify d_drive_space is nullable
  const dDriveCol = columns.find((c) => c.name === "d_drive_space");
  if (dDriveCol && dDriveCol.notnull === 1) {
    throw new Error("d_drive_space should be nullable");
  }

  console.log("✅ Database validation passed");
  db.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Validation failed:", error);
  db.close();
  process.exit(1);
}
