import { Database } from "bun:sqlite";
import type { DriveStatus, StatusRepository } from "./types";

export class SqliteStatusRepository implements StatusRepository {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initializeDb();
  }

  private initializeDb(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS machine_status (
        machine TEXT NOT NULL PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        c_drive_space REAL NOT NULL,
        d_drive_space REAL NOT NULL
      )
    `);
  }

  async saveStatus(status: DriveStatus): Promise<void> {
    const existingStatus = await this.getMachineStatus(status.machine);
    if (existingStatus) {
      const query = `
        UPDATE machine_status SET
          timestamp = ?,
          c_drive_space = ?,
          d_drive_space = ?
        WHERE machine = ?
      `;
      this.db.run(query, [
        status.timestamp,
        status.cDriveSpace,
        status.dDriveSpace,
        status.machine,
      ]);
    } else {
      const query = `INSERT INTO machine_status (machine, timestamp, c_drive_space, d_drive_space) VALUES (?, ?, ?, ?)`;
      this.db.run(query, [
        status.machine,
        status.timestamp,
        status.cDriveSpace,
        status.dDriveSpace,
      ]);
    }
  }

  async getMachineStatus(machine: string): Promise<DriveStatus | null> {
    const query = `
      SELECT * FROM machine_status WHERE machine = ?
    `;
    return this.db.prepare(query).get(machine) as DriveStatus | null;
  }

  async getLatestStatuses(): Promise<DriveStatus[]> {
    const query = `
      SELECT * FROM machine_status     `;
    return this.db.prepare(query).all() as DriveStatus[];
  }

  async getLatestStatusForMachine(
    machine: string
  ): Promise<DriveStatus | null> {
    return this.getMachineStatus(machine);
  }
}
