import nodemailer from "nodemailer";
import { formatDate } from "./html-report";
import type { ContactFormData, DriveStatus, EmailService } from "./types";

function driveSpaceColor(gb: number): string {
  if (gb < 10) return "#e74c3c";
  if (gb < 20) return "#e67e22";
  if (gb < 30) return "#f1c40f";
  return "#2ecc71";
}

function driveCell(value: number | null): string {
  if (value == null) return `<td style="padding:8px 12px;text-align:right;">-</td>`;
  const color = driveSpaceColor(value);
  return `<td style="padding:8px 12px;text-align:right;"><span style="color:${color};font-weight:bold;">${value.toFixed(1)} GB</span></td>`;
}

function alertEmailHtml(
  severity: "warning" | "critical",
  machine: string,
  status: DriveStatus
): string {
  const color = severity === "critical" ? "#e74c3c" : "#e67e22";
  const label = severity === "critical" ? "KRITISKT" : "VARNING";
  const dDriveRow =
    status.d_drive_space != null
      ? `<tr><td style="padding:6px 12px;">D:</td>${driveCell(status.d_drive_space)}</tr>`
      : "";

  return `
<div style="font-family:sans-serif;max-width:500px;">
  <div style="background:${color};color:#fff;padding:12px 16px;border-radius:6px 6px 0 0;font-size:18px;font-weight:bold;">
    ${label}: Diskutrymme lågt
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:16px;border-radius:0 0 6px 6px;">
    <p style="margin:0 0 12px;font-size:16px;"><strong>${machine}</strong></p>
    <table style="border-collapse:collapse;">
      <tr><td style="padding:6px 12px;">C:</td>${driveCell(status.c_drive_space)}</tr>
      ${dDriveRow}
    </table>
    <p style="margin:12px 0 0;color:#888;font-size:13px;">Senast inskickad status: ${formatDate(status.timestamp)}</p>
  </div>
</div>`;
}

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
      `⚠️ Drive Space Warning: ${machine}`,
      alertEmailHtml("warning", machine, status)
    );
  }

  async sendErrorEmail(machine: string, status: DriveStatus): Promise<void> {
    await this.sendEmail(
      `🔴 Drive Space Critical: ${machine}`,
      alertEmailHtml("critical", machine, status)
    );
  }

  async sendDailyReport(statuses: DriveStatus[]): Promise<void> {
    const hasDDrive = statuses.some((s) => s.d_drive_space != null);
    const dHeader = hasDDrive ? `<th style="padding:8px 12px;text-align:right;">D:</th>` : "";
    const rows = statuses
      .map((s) => {
        const dCell = hasDDrive ? driveCell(s.d_drive_space) : "";
        return `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 12px;font-weight:bold;">${s.machine}</td>
          ${driveCell(s.c_drive_space)}
          ${dCell}
          <td style="padding:8px 12px;color:#888;">${formatDate(s.timestamp)}</td>
        </tr>`;
      })
      .join("");

    const html = `
<div style="font-family:sans-serif;max-width:600px;">
  <h2 style="margin:0 0 12px;">Daglig statusrapport</h2>
  <table style="border-collapse:collapse;width:100%;">
    <thead>
      <tr style="background:#f5f5f5;border-bottom:2px solid #ddd;">
        <th style="padding:8px 12px;text-align:left;">Station</th>
        <th style="padding:8px 12px;text-align:right;">C:</th>
        ${dHeader}
        <th style="padding:8px 12px;text-align:left;">Senast uppdaterad</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;

    await this.sendEmail("Daglig status från stationerna", html);
  }

  async sendContactEmail(data: ContactFormData): Promise<void> {
    const phoneRow = data.phone
      ? `<tr><td style="padding:6px 12px;color:#888;">Telefon:</td><td style="padding:6px 12px;">${data.phone}</td></tr>`
      : "";
    const companyRow = data.company
      ? `<tr><td style="padding:6px 12px;color:#888;">Företag:</td><td style="padding:6px 12px;">${data.company}</td></tr>`
      : "";

    const html = `
<div style="font-family:sans-serif;max-width:600px;">
  <div style="background:#eab308;color:#000;padding:12px 16px;border-radius:6px 6px 0 0;font-size:18px;font-weight:bold;">
    Nytt kontaktformulär
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:16px;border-radius:0 0 6px 6px;">
    <table style="border-collapse:collapse;width:100%;">
      <tr><td style="padding:6px 12px;color:#888;">Namn:</td><td style="padding:6px 12px;font-weight:bold;">${data.name}</td></tr>
      <tr><td style="padding:6px 12px;color:#888;">Email:</td><td style="padding:6px 12px;">${data.email}</td></tr>
      ${phoneRow}
      ${companyRow}
    </table>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
    <p style="margin:0;white-space:pre-wrap;">${data.message}</p>
  </div>
</div>`;

    const subject = `Kontaktformulär: ${data.name}`;
    console.log(`Sending contact email to ${this.recipientEmail} with subject: ${subject}`);
    const recipients = this.recipientEmail.split(",");
    await this.transporter.sendMail({
      from: this.gmailUser,
      to: recipients,
      replyTo: data.email,
      subject,
      html,
    });
  }

  private async sendEmail(subject: string, html: string): Promise<void> {
    console.log(
      `Sending email to ${this.recipientEmail} with subject: ${subject}`
    );
    const recipients = this.recipientEmail.split(",");
    await this.transporter.sendMail({
      from: this.gmailUser,
      to: recipients,
      subject,
      html,
    });
  }
}
