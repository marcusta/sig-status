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
