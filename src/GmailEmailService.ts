import nodemailer from "nodemailer";
import { formatDate } from "./html-report";
import type { DriveStatus, EmailService } from "./types";

export class GmailEmailService implements EmailService {
  private transporter: nodemailer.Transporter;
  private recipientEmail: string;
  private gmailUser: string;

  constructor(gmailUser: string, appPassword: string, recipientEmail: string) {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: appPassword },
    });
    this.recipientEmail = recipientEmail;
    this.gmailUser = gmailUser;
  }

  async sendWarningEmail(machine: string, status: DriveStatus): Promise<void> {
    await this.sendEmail(
      "Drive Space Warning",
      `Low drive space warning for ${machine}:\nC: ${
        status.c_drive_space
      }GB\nD: ${status.d_drive_space}GB, Senast inskickad status: ${formatDate(
        status.timestamp
      )}`
    );
  }

  async sendErrorEmail(machine: string, status: DriveStatus): Promise<void> {
    await this.sendEmail(
      "Drive Space Critical",
      `Critical drive space for ${machine}:\nC: ${status.c_drive_space}GB\nD: ${
        status.d_drive_space
      }GB, senast inskickad status: ${formatDate(status.timestamp)}`
    );
  }

  async sendDailyReport(statuses: DriveStatus[]): Promise<void> {
    const report =
      "Status från stationerna vid deras senaste uppdatering:\n" +
      statuses
        .map(
          (s) =>
            `${s.machine}: C: ${s.c_drive_space}GB, D: ${
              s.d_drive_space
            }GB, senast inskickad status: ${formatDate(s.timestamp)}`
        )
        .join("\n");

    await this.sendEmail("Daily status från stationerna", report);
  }

  private async sendEmail(subject: string, text: string): Promise<void> {
    console.log(
      `Sending email to ${this.recipientEmail} with subject: ${subject}`
    );
    const recipients = this.recipientEmail.split(",");
    await this.transporter.sendMail({
      from: this.gmailUser,
      to: recipients,
      subject,
      text,
    });
  }
}
