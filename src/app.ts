import { Hono } from "hono";
import type {
  AppConfig,
  DriveStatus,
  EmailService,
  StatusRepository,
} from "./types";

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
      const status: DriveStatus = await c.req.json();
      console.log(`Received status for ${status.machine}`);
      await this.statusRepo.saveStatus(status);
      await this.checkThresholds(status);
      return c.json({ success: true });
    });

    this.app.get("/status/:machine", async (c) => {
      const machine = c.req.param("machine");
      const status = await this.statusRepo.getLatestStatusForMachine(machine);
      return c.json(status);
    });
  }

  private async checkThresholds(status: DriveStatus): Promise<void> {
    const hardThresholdReminderTime = 60 * 60 * 1000;
    const softThresholdReminderTime = 24 * 60 * 60 * 1000;
    const minSpace = Math.min(status.cDriveSpace, status.dDriveSpace);
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
