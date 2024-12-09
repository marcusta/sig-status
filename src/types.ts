export interface DriveStatus {
  machine: string;
  timestamp: string;
  cDriveSpace: number;
  dDriveSpace: number;
}

export interface StatusRepository {
  saveStatus(status: DriveStatus): Promise<void>;
  getLatestStatuses(): Promise<DriveStatus[]>;
  getLatestStatusForMachine(machine: string): Promise<DriveStatus | null>;
  getLastEmailSentForMachine(machine: string): Promise<Date | null>;
  setLastEmailSentForMachine(machine: string, timestamp: Date): Promise<void>;
}

export interface EmailService {
  sendWarningEmail(machine: string, status: DriveStatus): Promise<void>;
  sendErrorEmail(machine: string, status: DriveStatus): Promise<void>;
  sendDailyReport(statuses: DriveStatus[]): Promise<void>;
}

export interface AppConfig {
  port: number;
  softThreshold: number;
  hardThreshold: number;
  gmailUser: string;
  gmailPassword: string;
  recipientEmail: string;
}
