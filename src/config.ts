import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export interface ServiceConfig {
  server: {
    port: number;
  };
  google: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    pubsubTopic: string;
  };
  gemini: {
    apiKey: string;
  };
  whatsapp: {
    enabled: boolean;
    targetNumber: string;
    sessionDir: string;
  };
  slack: {
    enabled: boolean;
    webhookUrl: string;
    botToken: string;
    channel: string;
  };
  rules: {
    urgencyThreshold: number;
    vipSenders: string[];
    keywordFilters: string[];
    pollingIntervalSec: number;
  };
}

const parseCommaSeparated = (val?: string): string[] => {
  if (!val) return [];
  return val
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
};

export const config: ServiceConfig = {
  server: {
    port: parseInt(process.env.PORT || "5000", 10)
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
    pubsubTopic: process.env.GMAIL_PUBSUB_TOPIC || ""
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || ""
  },
  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED !== "false",
    targetNumber: process.env.WHATSAPP_TARGET_NUMBER || "",
    sessionDir: path.resolve(process.cwd(), "whatsapp_session")
  },
  slack: {
    enabled: process.env.SLACK_ENABLED !== "false",
    webhookUrl: process.env.SLACK_WEBHOOK_URL || "",
    botToken: process.env.SLACK_BOT_TOKEN || "",
    channel: process.env.SLACK_CHANNEL || ""
  },
  rules: {
    urgencyThreshold: parseInt(process.env.URGENCY_THRESHOLD || "7", 10),
    vipSenders: parseCommaSeparated(process.env.VIP_SENDERS),
    keywordFilters: parseCommaSeparated(process.env.KEYWORD_FILTERS),
    pollingIntervalSec: Math.max(10, parseInt(process.env.POLLING_INTERVAL_SEC || "60", 10))
  }
};