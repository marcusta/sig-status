// Relay (indicator lamp) fields. All null when the bay runs a build that
// does not report relay status.
export interface RelayStatus {
  relay_enabled: boolean | null;
  relay_connected: boolean | null;
  relay_port: string | null;
  relay_error: string | null;
  relay_updated_at: string | null;
}

export interface DriveStatusReport extends RelayStatus {
  machine: string;
  c_drive_space: number;
  d_drive_space: number | null;
  timestamp: string;
}

export interface DriveStatus extends RelayStatus {
  machine: string;
  timestamp: string;
  c_drive_space: number;
  d_drive_space: number | null;
  last_email_sent: string;
  last_relay_email_sent: string | null;
}

// True when the bay expects a relay and reports it as missing.
export function isRelayMissing(status: RelayStatus): boolean {
  return status.relay_enabled === true && status.relay_connected === false;
}

export interface StatusRepository {
  saveStatus(status: DriveStatusReport): Promise<void>;
  getLatestStatuses(): Promise<DriveStatus[]>;
  getLatestStatusForMachine(machine: string): Promise<DriveStatus | null>;
  getLastEmailSentForMachine(machine: string): Promise<Date | null>;
  setLastEmailSentForMachine(machine: string, timestamp: Date): Promise<void>;
  getLastRelayEmailSentForMachine(machine: string): Promise<Date | null>;
  setLastRelayEmailSentForMachine(machine: string, timestamp: Date): Promise<void>;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
}

export interface EmailService {
  sendWarningEmail(machine: string, status: DriveStatusReport): Promise<void>;
  sendErrorEmail(machine: string, status: DriveStatusReport): Promise<void>;
  sendRelayMissingEmail(machine: string, status: DriveStatusReport): Promise<void>;
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
