import { config } from "../config.js";
import { fetchUnreadEmails } from "./gmailService.js";
import { analyzeEmail } from "./geminiService.js";
import { evaluateHeuristically } from "./heuristicService.js";
import { sendWhatsAppNotification } from "./whatsappService.js";
import { sendSlackNotification } from "./slackService.js";
import { isEmailProcessed, recordProcessedEmail } from "../db/cache.js";

export const runIngestionCycle = async (): Promise<{
  processed: number;
  notified: number;
  skipped: number;
}> => {
  const stats = { processed: 0, notified: 0, skipped: 0 };

  try {
    const unreadEmails = await fetchUnreadEmails(10);
    const newEmails = unreadEmails.filter(e => !isEmailProcessed(e.id));

    if (newEmails.length === 0) {
      return stats;
    }

    console.log(`[Pipeline] Found ${newEmails.length} new unread email(s) to triage.`);

    for (const email of newEmails) {
      stats.processed++;

      // 1. Initial heuristic / rule-based triage (Zero AI needed)
      const heuristicTriage = evaluateHeuristically(email);

      let effectiveUrgency = heuristicTriage.urgencyScore;
      let effectiveCategory = heuristicTriage.category;
      let effectiveSummary = heuristicTriage.summary;
      let effectiveAction = heuristicTriage.actionRequired;
      let triageSource = heuristicTriage.source;

      // 2. If AI API Key is provided, enhance with Gemini AI
      if (config.gemini.apiKey) {
        try {
          const aiAnalysis = await analyzeEmail(email);
          // If heuristics already caught a VIP or custom keyword, keep that higher urgency priority
          if (heuristicTriage.source === "VIP" || heuristicTriage.source === "KEYWORD") {
            effectiveUrgency = Math.max(heuristicTriage.urgencyScore, aiAnalysis.urgencyScore);
            effectiveCategory = heuristicTriage.category;
          } else {
            effectiveUrgency = aiAnalysis.urgencyScore;
            effectiveCategory = aiAnalysis.category;
          }

          if (aiAnalysis.summary && aiAnalysis.summary.length > 0) {
            effectiveSummary = aiAnalysis.summary;
          }
          if (aiAnalysis.actionRequired) {
            effectiveAction = aiAnalysis.actionRequired;
          }
          triageSource = "AI";
        } catch (err: any) {
          console.warn("[Pipeline] AI enhancement skipped, using rule-based analysis:", err.message);
        }
      }

      const shouldNotify =
        heuristicTriage.source === "VIP" ||
        heuristicTriage.source === "KEYWORD" ||
        effectiveUrgency >= config.rules.urgencyThreshold;

      const payload = {
        subject: email.subject,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        urgencyScore: effectiveUrgency,
        category: effectiveCategory,
        summary: effectiveSummary,
        actionRequired: effectiveAction,
        bodySnippet: email.body || email.snippet,
        emailId: email.id
      };

      const dispatchedChannels: string[] = [];

      if (shouldNotify) {
        console.log(`\x1b[33m[Alert Triggered]\x1b[0m "${email.subject}" (Score: ${effectiveUrgency}/10 | Tag: ${effectiveCategory} | Triage: ${triageSource})`);

        // Dispatch WhatsApp
        if (config.whatsapp.enabled) {
          const waRes = await sendWhatsAppNotification(payload);
          if (waRes.success) {
            dispatchedChannels.push("WhatsApp");
            console.log(`  \x1b[32m✔\x1b[0m Delivered to WhatsApp`);
          } else {
            console.log(`  \x1b[31m✖\x1b[0m WhatsApp delivery failed: ${waRes.error}`);
          }
        }

        // Dispatch Slack
        if (config.slack.enabled) {
          const slackRes = await sendSlackNotification(payload);
          if (slackRes.success) {
            dispatchedChannels.push("Slack");
            console.log(`  \x1b[32m✔\x1b[0m Delivered to Slack`);
          } else {
            console.log(`  \x1b[31m✖\x1b[0m Slack delivery failed: ${slackRes.error}`);
          }
        }

        recordProcessedEmail({
          id: email.id,
          subject: email.subject,
          sender: email.senderEmail,
          urgency_score: effectiveUrgency,
          status: "NOTIFIED",
          dispatched_channels: dispatchedChannels.join(", ") || "None"
        });

        stats.notified++;
      } else {
        console.log(`[Skipped] "${email.subject}" (Score: ${effectiveUrgency}/10 below threshold ${config.rules.urgencyThreshold})`);

        recordProcessedEmail({
          id: email.id,
          subject: email.subject,
          sender: email.senderEmail,
          urgency_score: effectiveUrgency,
          status: "SKIPPED",
          dispatched_channels: "None"
        });

        stats.skipped++;
      }
    }
  } catch (err: any) {
    console.error("[Pipeline] Ingestion cycle encountered an error:", err.message);
  }

  return stats;
};