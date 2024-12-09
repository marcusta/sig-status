import type { AppConfig } from "./types";

// config.ts
export function loadConfig(): AppConfig {
  const required = (name: string): string => {
    const value = Bun.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
  };

  return {
    port: 3004,
    softThreshold: 50,
    hardThreshold: 20,
    gmailUser: required("GMAIL_USER"),
    gmailPassword: required("GMAIL_PASSWORD"),
    recipientEmail: required("RECIPIENT_EMAIL"),
  };
}
