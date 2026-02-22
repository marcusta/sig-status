export interface DriveStatusReport {
  machine: string;
  c_drive_space: number;
  d_drive_space: number | null;
  timestamp: string;
}

export interface DriveStatus {
  machine: string;
  timestamp: string;
  c_drive_space: number;
  d_drive_space: number | null;
  last_email_sent: string;
}

export interface StatusRepository {
  saveStatus(status: DriveStatusReport): Promise<void>;
  getLatestStatuses(): Promise<DriveStatus[]>;
  getLatestStatusForMachine(machine: string): Promise<DriveStatus | null>;
  getLastEmailSentForMachine(machine: string): Promise<Date | null>;
  setLastEmailSentForMachine(machine: string, timestamp: Date): Promise<void>;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
}

export interface EmailService {
  sendWarningEmail(machine: string, status: DriveStatus): Promise<void>;
  sendErrorEmail(machine: string, status: DriveStatus): Promise<void>;
  sendDailyReport(statuses: DriveStatus[]): Promise<void>;
  sendContactEmail(data: ContactFormData): Promise<void>;
}

export interface AppConfig {
  port: number;
  softThreshold: number;
  hardThreshold: number;
  gmailUser: string;
  gmailPassword: string;
  recipientEmail: string;
}
