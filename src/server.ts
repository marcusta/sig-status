import fs from "fs";
import { MonitoringApp } from "./app";
import { loadConfig } from "./config";
import { GmailEmailService } from "./GmailEmailService";
import { SqliteStatusRepository } from "./SqliteStatusReporter";

const config = loadConfig();

const dataDir = "./data";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const statusRepo = new SqliteStatusRepository(`${dataDir}/status.db`);
const emailService = new GmailEmailService(
  config.gmailUser,
  config.gmailPassword,
  config.recipientEmail
);

const app = new MonitoringApp(statusRepo, emailService, config);

app.start();
