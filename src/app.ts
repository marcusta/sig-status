import { Hono } from "hono";
import { htmlReport } from "./html-report";
import type {
  AppConfig,
  ContactFormData,
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

const CONTACT_RATE_LIMIT = new Map<string, number[]>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (CONTACT_RATE_LIMIT.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW
  );
  CONTACT_RATE_LIMIT.set(ip, timestamps);
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  return false;
}

function countUrls(text: string): number {
  const urlPattern = /https?:\/\/[^\s]+/gi;
  return (text.match(urlPattern) || []).length;
}

const ALLOWED_ORIGIN = "swedenindoorgolf.se";

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
        c_drive_space: status.cDriveSpace ?? status.c_drive_space ?? 0,
        d_drive_space: status.dDriveSpace ?? status.d_drive_space ?? null,
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

    // ─── Contact form endpoint ───

    const corsHeaders = {
      "Access-Control-Allow-Origin": `https://app.${ALLOWED_ORIGIN}`,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    this.app.options("/contact", (c) => {
      return c.body(null, 204, corsHeaders);
    });

    this.app.post("/contact", async (c) => {
      // CORS headers on every response
      Object.entries(corsHeaders).forEach(([k, v]) => c.header(k, v));

      // Origin check
      const origin = c.req.header("origin") || "";
      if (!origin.includes(ALLOWED_ORIGIN)) {
        return c.json({ error: "Forbidden" }, 403);
      }

      // Rate limit by IP
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        c.req.header("x-real-ip") ||
        "unknown";
      if (isRateLimited(ip)) {
        return c.json(
          { error: "För många förfrågningar. Försök igen senare." },
          429
        );
      }

      let body: Record<string, unknown>;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Ogiltig förfrågan." }, 400);
      }

      // Honeypot
      if (body._url) {
        // Silently accept to not tip off bots
        return c.json({ success: true });
      }

      const { name, email, phone, company, message } = body as Record<
        string,
        string
      >;

      // Required fields
      if (!name?.trim() || !email?.trim() || !message?.trim()) {
        return c.json(
          { error: "Namn, email och meddelande är obligatoriska." },
          400
        );
      }

      // Email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return c.json({ error: "Ogiltig emailadress." }, 400);
      }

      // Message length
      if (message.length > 5000) {
        return c.json(
          { error: "Meddelandet är för långt (max 5000 tecken)." },
          400
        );
      }

      // URL spam check
      if (countUrls(message) > 5) {
        return c.json({ error: "Meddelandet innehåller för många länkar." }, 400);
      }

      try {
        const data: ContactFormData = {
          name: name.trim(),
          email: email.trim(),
          phone: phone?.trim() || undefined,
          company: company?.trim() || undefined,
          message: message.trim(),
        };
        await this.emailService.sendContactEmail(data);
        return c.json({ success: true });
      } catch (err) {
        console.error("Failed to send contact email:", err);
        return c.json(
          { error: "Kunde inte skicka meddelandet. Försök igen senare." },
          500
        );
      }
    });
  }

  private async checkThresholds(status: DriveStatusReport): Promise<void> {
    const hardThresholdReminderTime = 60 * 60 * 1000;
    const softThresholdReminderTime = 24 * 60 * 60 * 1000;
    const minSpace = status.d_drive_space != null
      ? Math.min(status.c_drive_space, status.d_drive_space)
      : status.c_drive_space;
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
