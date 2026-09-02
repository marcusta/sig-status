import { Database } from "bun:sqlite";
import type { DriveStatus, DriveStatusReport, StatusRepository } from "./types";

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
        d_drive_space REAL,
        last_email_sent DATETIME,
        relay_enabled INTEGER,
        relay_connected INTEGER,
        relay_port TEXT,
        relay_error TEXT,
        relay_updated_at DATETIME,
        last_relay_email_sent DATETIME
      )
    `);
  }

  private static boolToInt(value: boolean | null): number | null {
    return value == null ? null : value ? 1 : 0;
  }

  private static rowToStatus(row: Record<string, unknown> | null): DriveStatus | null {
    if (!row) return null;
    const intToBool = (v: unknown): boolean | null =>
      v == null ? null : Number(v) !== 0;
    return {
      ...(row as unknown as DriveStatus),
      relay_enabled: intToBool(row.relay_enabled),
      relay_connected: intToBool(row.relay_connected),
    };
  }

  async saveStatus(status: DriveStatusReport): Promise<void> {
    const existingStatus = await this.getMachineStatus(status.machine);
    console.log("existingStatus", existingStatus);
    console.log("new status", status);
    if (existingStatus) {
      const query = `
        UPDATE machine_status SET
          timestamp = ?,
          c_drive_space = ?,
          d_drive_space = ?,
          relay_enabled = ?,
          relay_connected = ?,
          relay_port = ?,
          relay_error = ?,
          relay_updated_at = ?
        WHERE machine = ?
      `;
      this.db.run(query, [
        status.timestamp,
        status.c_drive_space,
        status.d_drive_space,
        SqliteStatusRepository.boolToInt(status.relay_enabled),
        SqliteStatusRepository.boolToInt(status.relay_connected),
        status.relay_port,
        status.relay_error,
        status.relay_updated_at,
        status.machine,
      ]);
    } else {
      const query = `INSERT INTO machine_status
        (machine, timestamp, c_drive_space, d_drive_space,
         relay_enabled, relay_connected, relay_port, relay_error, relay_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      this.db.run(query, [
        status.machine,
        status.timestamp,
        status.c_drive_space,
        status.d_drive_space,
        SqliteStatusRepository.boolToInt(status.relay_enabled),
        SqliteStatusRepository.boolToInt(status.relay_connected),
        status.relay_port,
        status.relay_error,
        status.relay_updated_at,
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

  async setLastRelayEmailSentForMachine(
    machine: string,
    timestamp: Date
  ): Promise<void> {
    // The machine row always exists here: saveStatus runs before checkRelay.
    this.db.run(
      `UPDATE machine_status SET last_relay_email_sent = ? WHERE machine = ?`,
      [timestamp.toISOString(), machine]
    );
  }

  async getLastRelayEmailSentForMachine(machine: string): Promise<Date | null> {
    const result = this.db
      .prepare(`SELECT last_relay_email_sent FROM machine_status WHERE machine = ?`)
      .get(machine) as { last_relay_email_sent: string | null } | null;
    return result?.last_relay_email_sent
      ? new Date(result.last_relay_email_sent)
      : null;
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
    const row = this.db.prepare(query).get(machine) as Record<string, unknown> | null;
    return SqliteStatusRepository.rowToStatus(row);
  }

  async getLatestStatuses(): Promise<DriveStatus[]> {
    const query = `SELECT * FROM machine_status ORDER BY machine`;
    const rows = this.db.prepare(query).all() as Record<string, unknown>[];
    return rows.map((r) => SqliteStatusRepository.rowToStatus(r)!);
  }

  async getLatestStatusForMachine(
    machine: string
  ): Promise<DriveStatus | null> {
    return this.getMachineStatus(machine);
  }
}
