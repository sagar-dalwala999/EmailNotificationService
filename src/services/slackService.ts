import { config } from "../config.js";

export const sendSlackNotification = async (payload: {
  subject: string;
  senderName: string;
  senderEmail: string;
  urgencyScore: number;
  category: string;
  summary: string[];
  actionRequired: string | null;
  bodySnippet: string;
  emailId: string;
}): Promise<{ success: boolean; error?: string }> => {
  if (!config.slack.enabled) {
    return { success: false, error: "Slack dispatch disabled via config" };
  }

  if (!config.slack.webhookUrl && !config.slack.botToken) {
    return { success: false, error: "Missing SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN in .env" };
  }

  const isCritical = payload.urgencyScore >= 8;
  const badgeEmoji = isCritical ? "🚨" : "⚡";
  const badgeText = isCritical ? "CRITICAL EMAIL ALERT" : "HIGH PRIORITY ALERT";

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${badgeEmoji} [${badgeText}] ${payload.subject}`.slice(0, 150),
        emoji: true
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*From:*\n${payload.senderName} (<${payload.senderEmail}>)`
        },
        {
          type: "mrkdwn",
          text: `*Urgency Score:*\n\`${payload.urgencyScore}/10\`  •  *Tag:* ${payload.category}`
        }
      ]
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📋 AI Executive Summary:*\n${payload.summary.map(b => `• ${b}`).join("\n")}`
      }
    }
  ];

  if (payload.actionRequired && payload.actionRequired.trim()) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🎯 ACTION REQUIRED:*\n\`\`\`${payload.actionRequired}\`\`\``
      }
    });
  }

  if (payload.bodySnippet && payload.bodySnippet.trim()) {
    const cleanSnippet = payload.bodySnippet.slice(0, 400).replace(/\n\s*\n/g, "\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📝 Original Message Preview:*\n>${cleanSnippet.replace(/\n/g, "\n>")}`
      }
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open in Gmail ↗",
          emoji: true
        },
        url: `https://mail.google.com/mail/u/0/#inbox/${payload.emailId}`,
        style: "primary"
      }
    ]
  });

  try {
    if (config.slack.webhookUrl) {
      const response = await fetch(config.slack.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${badgeEmoji} [${badgeText}] ${payload.subject} (${payload.urgencyScore}/10)`,
          blocks
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack Webhook HTTP ${response.status}: ${errorText}`);
      }
    } else if (config.slack.botToken && config.slack.channel) {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${config.slack.botToken}`
        },
        body: JSON.stringify({
          channel: config.slack.channel,
          text: `${badgeEmoji} [${badgeText}] ${payload.subject} (${payload.urgencyScore}/10)`,
          blocks
        })
      });

      const data = (await response.json()) as any;
      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error || "Unknown"}`);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Slack] Delivery failed:", err.message);
    return { success: false, error: err.message };
  }
};