import { Hono } from "hono";
import { htmlReport } from "./html-report";
import type {
  AppConfig,
  DriveStatusReport,
  EmailService,
  StatusRepository,
} from "./types";

interface StatusPost {
  machine: string;
  cDriveSpace?: number;
  dDriveSpace?: number;
  timestamp: string;
  c_drive_space?: number;
  d_drive_space?: number;
}

export class MonitoringApp {
  private app = new Hono();
  private statusRepo: StatusRepository;
  private emailService: EmailService;
  private config: AppConfig;

  constructor(
    statusRepo: StatusRepository,
    emailService: EmailService,
    config: AppConfig
  ) {
    this.statusRepo = statusRepo;
    this.emailService = emailService;
    this.config = config;
    this.setupRoutes();
    this.setupDailyReport();
  }

  private setupRoutes(): void {
    this.app.post("/status", async (c) => {
      // post object may contain values of format cDriveSpace and dDriveSpace as keys
      // convert them to c_drive_space and d_drive_space if so
      const status: StatusPost = await c.req.json();
      const driveStatus: DriveStatusReport = {
        machine: status.machine,
        c_drive_space: status.cDriveSpace || status.c_drive_space || 0,
        d_drive_space: status.dDriveSpace || status.d_drive_space || 0,
        timestamp: status.timestamp,
      };
      console.log(`Received status for ${status.machine}`);
      await this.statusRepo.saveStatus(driveStatus);
      await this.checkThresholds(driveStatus);
      return c.json({ success: true });
    });

    this.app.get("/status/:machine", async (c) => {
      console.log("Getting status for machine");
      const machine = c.req.param("machine");
      const status = await this.statusRepo.getLatestStatusForMachine(machine);
      return c.json(status);
    });

    this.app.get("/status", async (c) => {
      console.log("Getting all statuses");
      const statuses = await this.statusRepo.getLatestStatuses();
      return c.json(statuses);
    });

    this.app.get("/status.html", async (c) => {
      const statuses = await this.statusRepo.getLatestStatuses();
      console.log(statuses);
      return c.html(htmlReport(statuses));
    });
  }

  private async checkThresholds(status: DriveStatusReport): Promise<void> {
    const hardThresholdReminderTime = 60 * 60 * 1000;
    const softThresholdReminderTime = 24 * 60 * 60 * 1000;
    const minSpace = Math.min(status.c_drive_space, status.d_drive_space);
    const lastEmailSent = await this.statusRepo.getLastEmailSentForMachine(
      status.machine
    );
    console.log(
      `Last email sent for ${status.machine}: ${lastEmailSent?.toISOString()}`
    );
    const timeSinceLastEmail = Date.now() - (lastEmailSent?.getTime() || 0);
    if (
      minSpace < this.config.hardThreshold &&
      timeSinceLastEmail > hardThresholdReminderTime
    ) {
      console.log(
        `Sending error email for ${status.machine} because it has less than ${this.config.hardThreshold} GB of free space`
      );
      await this.emailService.sendErrorEmail(status.machine, status);
      await this.statusRepo.setLastEmailSentForMachine(
        status.machine,
        new Date()
      );
    } else if (
      minSpace < this.config.softThreshold &&
      timeSinceLastEmail > softThresholdReminderTime
    ) {
      console.log(
        `Sending warning email for ${status.machine} because it has less than ${this.config.softThreshold} GB of free space`
      );
      await this.emailService.sendWarningEmail(status.machine, status);
      await this.statusRepo.setLastEmailSentForMachine(
        status.machine,
        new Date()
      );
    }
  }

  private setupDailyReport(): void {
    setInterval(async () => {
      const statuses = await this.statusRepo.getLatestStatuses();
      await this.emailService.sendDailyReport(statuses);
    }, 24 * 60 * 60 * 1000);
  }

  public start(): void {
    console.log(`Starting server on port ${this.config.port}`);
    Bun.serve({ fetch: this.app.fetch, port: this.config.port });
  }
}
