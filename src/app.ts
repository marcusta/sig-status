import { Hono } from "hono";
import { htmlReport } from "./html-report";
import {
  isRelayMissing,
  type AppConfig,
  type ContactFormData,
  type DriveStatusReport,
  type EmailService,
  type StatusRepository,
} from "./types";

interface StatusPost {
  machine: string;
  cDriveSpace?: number;
  dDriveSpace?: number;
  timestamp: string;
  c_drive_space?: number;
  d_drive_space?: number;
  relayEnabled?: boolean;
  relayConnected?: boolean;
  relayPort?: string;
  relayError?: string;
  relayUpdatedAt?: string;
  relay_enabled?: boolean;
  relay_connected?: boolean;
  relay_port?: string;
  relay_error?: string;
  relay_updated_at?: string;
}

const RELAY_REMINDER_MS = 24 * 60 * 60 * 1000;

// Machines silent longer than this are out of production and left out of the daily report.
const INACTIVE_AFTER_MS = 4 * 30 * 24 * 60 * 60 * 1000;

export function isActive(status: { timestamp: string }, now = Date.now()): boolean {
  const reported = new Date(status.timestamp).getTime();
  return Number.isFinite(reported) && now - reported < INACTIVE_AFTER_MS;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return null;
}

function toStr(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
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

const ALLOWED_ORIGINS = [
  "https://swedenindoorgolf.se",
  "https://www.swedenindoorgolf.se",
];

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
        relay_enabled: toBool(status.relayEnabled ?? status.relay_enabled),
        relay_connected: toBool(status.relayConnected ?? status.relay_connected),
        relay_port: toStr(status.relayPort ?? status.relay_port),
        relay_error: toStr(status.relayError ?? status.relay_error),
        relay_updated_at: toStr(status.relayUpdatedAt ?? status.relay_updated_at),
      };
      console.log(`Received status for ${status.machine}`);
      await this.statusRepo.saveStatus(driveStatus);
      await this.checkThresholds(driveStatus);
      await this.checkRelay(driveStatus);
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

    const buildCorsHeaders = (origin: string) => {
      const allowed = ALLOWED_ORIGINS.includes(origin)
        ? origin
        : ALLOWED_ORIGINS[0];
      return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
      };
    };

    this.app.options("/contact", (c) => {
      const origin = c.req.header("origin") || "";
      return c.body(null, 204, buildCorsHeaders(origin));
    });

    this.app.post("/contact", async (c) => {
      const origin = c.req.header("origin") || "";
      // CORS headers on every response
      Object.entries(buildCorsHeaders(origin)).forEach(([k, v]) =>
        c.header(k, v)
      );

      // Origin check
      if (!ALLOWED_ORIGINS.includes(origin)) {
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

  private async checkRelay(status: DriveStatusReport): Promise<void> {
    if (!isRelayMissing(status)) return;
    const lastSent = await this.statusRepo.getLastRelayEmailSentForMachine(
      status.machine
    );
    const sinceLast = Date.now() - (lastSent?.getTime() || 0);
    if (sinceLast <= RELAY_REMINDER_MS) return;
    console.log(
      `Sending relay missing email for ${status.machine}: ${status.relay_error}`
    );
    await this.emailService.sendRelayMissingEmail(status.machine, status);
    await this.statusRepo.setLastRelayEmailSentForMachine(
      status.machine,
      new Date()
    );
  }

  private setupDailyReport(): void {
    setInterval(async () => {
      const statuses = (await this.statusRepo.getLatestStatuses()).filter((s) =>
        isActive(s)
      );
      await this.emailService.sendDailyReport(statuses);
    }, 24 * 60 * 60 * 1000);
  }

  public start(): void {
    console.log(`Starting server on port ${this.config.port}`);
    Bun.serve({ fetch: this.app.fetch, port: this.config.port });
  }
}
