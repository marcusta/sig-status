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
        d_drive_space REAL NOT NULL,
        last_email_sent DATETIME
      )
    `);
  }

  async saveStatus(status: DriveStatus): Promise<void> {
    const existingStatus = await this.getMachineStatus(status.machine);
    console.log("existingStatus", existingStatus);
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
        status.c_drive_space,
        status.d_drive_space,
        status.machine,
      ]);
    } else {
      const query = `INSERT INTO machine_status (machine, timestamp, c_drive_space, d_drive_space) VALUES (?, ?, ?, ?)`;
      this.db.run(query, [
        status.machine,
        status.timestamp,
        status.c_drive_space,
        status.d_drive_space,
      ]);
    }
  }

  async setLastEmailSentForMachine(
    machine: string,
    timestamp: Date
  ): Promise<void> {
    const lastEmailSent = await this.getLastEmailSentForMachine(machine);
    if (lastEmailSent) {
      this.db.run(
        `UPDATE machine_status SET last_email_sent = ? WHERE machine = ?`,
        [timestamp.toISOString(), machine]
      );
    } else {
      this.db.run(
        `INSERT INTO machine_status (machine, last_email_sent) VALUES (?, ?)`,
        [machine, timestamp.toISOString()]
      );
    }
  }

  async getLastEmailSentForMachine(machine: string): Promise<Date | null> {
    const query = `SELECT last_email_sent FROM machine_status WHERE machine = ?`;
    const result = this.db.prepare(query).get(machine) as {
      last_email_sent: string;
    } | null;
    return result ? new Date(result.last_email_sent) : null;
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
