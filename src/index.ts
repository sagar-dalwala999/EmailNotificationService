import { config } from "./config.js";
import { initWhatsApp } from "./services/whatsappService.js";
import { runIngestionCycle } from "./services/pipelineService.js";
import { watchGmail } from "./services/gmailService.js";
import { createWebhookApp } from "./services/webhookService.js";

const printBanner = () => {
  const triageMode = config.gemini.apiKey
    ? "Gemini 2.5 Flash AI + Rule-Based Engine"
    : "Rule-Based & Keyword Heuristics (Zero-AI Mode)";

  const mode = config.google.pubsubTopic
    ? `Real-Time Webhook (Pub/Sub: ${config.google.pubsubTopic})`
    : `Standard Interval Polling (Default: every ${config.rules.pollingIntervalSec}s)`;

  console.log("\n==================================================================");
  console.log("     INBOXPULSE MULTI-MODE NOTIFICATION DAEMON (HEADLESS)         ");
  console.log("==================================================================");
  console.log(`[Status] Operation Mode    : ${mode}`);
  console.log(`[Status] Triage Engine     : ${triageMode}`);
  console.log(`[Status] Urgency Threshold : >= ${config.rules.urgencyThreshold}/10`);
  console.log(`[Status] Webhook Receiver  : http://localhost:${config.server.port}/api/webhook/gmail`);
  console.log(`[Status] WhatsApp Dispatch : ${config.whatsapp.enabled ? "ENABLED" : "DISABLED"}`);
  console.log(`[Status] Slack Dispatch    : ${config.slack.enabled ? (config.slack.webhookUrl || config.slack.botToken ? "ENABLED" : "CONFIG REQUIRED") : "DISABLED"}`);
  console.log(`[Status] VIP Senders       : ${config.rules.vipSenders.length > 0 ? config.rules.vipSenders.join(", ") : "None"}`);
  console.log(`[Status] Keyword Triggers  : ${config.rules.keywordFilters.length > 0 ? config.rules.keywordFilters.join(", ") : "None"}`);
  console.log("==================================================================\n");
};

const main = async () => {
  printBanner();

  // Validate Google requirements
  if (!config.google.clientId || !config.google.clientSecret || !config.google.refreshToken) {
    console.error("\x1b[31m[ERROR] Google OAuth credentials are not fully configured in .env.\x1b[0m");
    console.error("Run `npm run setup` or update GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.\n");
  }

  // 1. Start Webhook Express Server
  const app = createWebhookApp();
  const server = app.listen(config.server.port, () => {
    console.log(`[Webhook] Listening for incoming Google Pub/Sub push events on port ${config.server.port}`);
  });

  // 2. Start WhatsApp socket
  if (config.whatsapp.enabled) {
    console.log("[Daemon] Initializing WhatsApp session bridge...");
    await initWhatsApp();
  }

  // 3. Register Gmail Watch if Pub/Sub Topic is configured
  let isWebhookActive = false;
  if (config.google.pubsubTopic) {
    try {
      await watchGmail(config.google.pubsubTopic);
      isWebhookActive = true;
      console.log("[Daemon] Real-time Push Webhook active! Waiting for incoming Google Pub/Sub events...");

      // Automatically renew watch once every 24 hours (Google watch expires in 7 days)
      setInterval(async () => {
        try {
          console.log("[Daemon] Renewing daily Gmail Pub/Sub watch registration...");
          await watchGmail(config.google.pubsubTopic);
        } catch (err: any) {
          console.error("[Daemon] Failed to renew watch:", err.message);
        }
      }, 24 * 60 * 60 * 1000);
    } catch (err: any) {
      console.error("\x1b[31m[Gmail Watch Error]\x1b[0m Failed to register watch topic:", err.message);
      console.log("Falling back to Default Interval Polling mode.\n");
    }
  }

  // 4. Run initial pipeline check
  console.log(`[Daemon] Performing initial email check...`);
  await runIngestionCycle();

  // 5. Default Interval Poller (Active when webhook is not set or as fallback)
  if (!isWebhookActive) {
    const intervalMs = config.rules.pollingIntervalSec * 1000;
    console.log(`\x1b[33m[Daemon] Default Polling Mode active.\x1b[0m Checking Gmail every ${config.rules.pollingIntervalSec}s...\n`);

    let isRunningCycle = false;
    setInterval(async () => {
      if (isRunningCycle) return;
      isRunningCycle = true;
      try {
        await runIngestionCycle();
      } catch (err: any) {
        console.error("[Daemon] Error in periodic polling cycle:", err.message);
      } finally {
        isRunningCycle = false;
      }
    }, intervalMs);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[Daemon] Gracefully shutting down email notification daemon...");
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((err) => {
  console.error("\x1b[31m[Fatal Error]\x1b[0m", err);
  process.exit(1);
});