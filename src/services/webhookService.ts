import express, { Request, Response } from "express";
import { runIngestionCycle } from "./pipelineService.js";

export const createWebhookApp = (): express.Express => {
  const app = express();

  app.use(express.json());

  // Health check endpoint (for dev tunnels, uptime monitors)
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Root greeting
  app.get("/", (_req: Request, res: Response) => {
    res.send("InboxPulse Real-Time Gmail Webhook Daemon Active");
  });

  // Google Cloud Pub/Sub Push Webhook Receiver
  app.post("/api/webhook/gmail", async (req: Request, res: Response) => {
    try {
      // 1. Immediately acknowledge the message to Pub/Sub
      res.status(200).send("OK");

      const body = req.body;
      let emailAddress = "";
      let historyId = "";

      if (body?.message?.data) {
        try {
          const decoded = Buffer.from(body.message.data, "base64").toString("utf-8");
          const parsed = JSON.parse(decoded);
          emailAddress = parsed.emailAddress || "";
          historyId = parsed.historyId || "";
        } catch (e) {}
      }

      console.log(`\n\x1b[36m[Webhook] Received real-time push event from Google Pub/Sub (History ID: ${historyId || "N/A"})\x1b[0m`);

      // 2. Trigger instant ingestion, AI triage, and multi-channel dispatch
      await runIngestionCycle();
    } catch (err: any) {
      console.error("[Webhook Error]", err.message);
    }
  });

  return app;
};