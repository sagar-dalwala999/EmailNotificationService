import readline from "readline";
import fs from "fs";
import path from "path";
import { google } from "googleapis";

const envPath = path.resolve(process.cwd(), ".env");

const maskSecret = (val?: string): string => {
  if (!val || val.length < 8) return val ? "••••••••" : "";
  return `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
};

/**
 * Prompts the user with optional secret masking.
 */
const askQuestion = (query: string, existingValue = "", isSecret = false): Promise<string> => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let displayPrompt = query;
    if (existingValue) {
      const displayVal = isSecret ? maskSecret(existingValue) : existingValue;
      displayPrompt += ` [Current: ${displayVal} | Press Enter to keep]`;
    }
    displayPrompt += "\n👉 ";

    if (isSecret && process.stdin.isTTY) {
      // Secret masked input
      process.stdout.write(displayPrompt);
      let inputBuffer = "";

      const onData = (char: Buffer) => {
        const str = char.toString("utf-8");
        if (str === "\r" || str === "\n") {
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          rl.close();
          const finalVal = inputBuffer.trim() || existingValue;
          resolve(finalVal);
        } else if (str === "\u0003") { // Ctrl+C
          process.exit(0);
        } else if (str === "\b" || str === "\x7f") { // Backspace
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          inputBuffer += str;
          process.stdout.write("*");
        }
      };

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onData);
    } else {
      // Standard input
      rl.question(displayPrompt, (answer) => {
        rl.close();
        resolve(answer.trim() || existingValue);
      });
    }
  });
};

const REDIRECT_URI = "http://localhost:5000/api/auth/google/callback";

const main = async () => {
  console.log("\n==================================================================");
  console.log("   INBOXPULSE EMAIL NOTIFICATION DAEMON — STEP-BY-STEP SETUP      ");
  console.log("==================================================================");
  console.log("Welcome! This interactive guide will walk you through setting up");
  console.log("your Gmail, Pub/Sub Webhooks, WhatsApp, Slack, and standing rules.\n");

  // Read existing .env if present
  let existingEnv: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        existingEnv[match[1].trim()] = match[2].trim();
      }
    }
  }

  // ============================================================================
  // STEP 1: GOOGLE GMAIL OAUTH & PUBSUB
  // ============================================================================
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║ STEP 1/5: GOOGLE GMAIL OAUTH & REAL-TIME WEBHOOK CONFIGURATION ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("Why this is needed: To securely connect to Gmail and receive instant email events.\n");

  const googleClientId = await askQuestion(
    "1.1 Paste your Google Client ID",
    existingEnv.GOOGLE_CLIENT_ID || "",
    false
  );
  const googleClientSecret = await askQuestion(
    "1.2 Paste your Google Client Secret",
    existingEnv.GOOGLE_CLIENT_SECRET || "",
    true // Mask secret
  );

  let googleRefreshToken = existingEnv.GOOGLE_REFRESH_TOKEN || "";
  if (googleClientId && googleClientSecret) {
    const doAuthNow = await askQuestion(
      googleRefreshToken ? "1.3 Regenerate Google authorization? (Y/N)" : "1.3 Connect & Authorize Gmail in browser now? (Y/N)",
      googleRefreshToken ? "N" : "Y"
    );

    if (doAuthNow.toUpperCase().startsWith("Y")) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          googleClientId,
          googleClientSecret,
          REDIRECT_URI
        );

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: "offline",
          scope: [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/userinfo.email"
          ],
          prompt: "consent"
        });

        console.log("\n  ┌─────────────────────────────────────────────────────────────┐");
        console.log("  │ GOOGLE SIGN-IN LINK (CLICK OR COPY TO BROWSER):            │");
        console.log("  └─────────────────────────────────────────────────────────────┘");
        console.log(`\n  \x1b[36m${authUrl}\x1b[0m\n`);
        console.log("  Instructions:");
        console.log("  • Click the link above to sign in with your Gmail and click 'Allow'.");
        console.log("  • Google will redirect to a URL with '?code=...'.");
        console.log("  • Copy that URL from your browser address bar and paste it below.\n");

        const redirectInput = await askQuestion("1.4 Paste the redirected URL (or code) from your browser address bar", "", true);
        if (redirectInput) {
          let code = redirectInput.trim();
          if (code.includes("code=")) {
            const urlObj = new URL(code.startsWith("http") ? code : `http://localhost/${code}`);
            code = urlObj.searchParams.get("code") || code;
          }

          const { tokens } = await oauth2Client.getToken(code);
          if (tokens.refresh_token) {
            googleRefreshToken = tokens.refresh_token;
            console.log("\x1b[32m  ✔ Google Refresh Token acquired and saved!\x1b[0m\n");
          } else {
            console.log("\x1b[33m  ✔ Authorized with Google successfully.\x1b[0m\n");
          }
        }
      } catch (err: any) {
        console.error("\x1b[31m  ✖ OAuth token exchange error:\x1b[0m", err.message);
      }
    }
  }

  // Google Cloud Pub/Sub Topic (For Instant Real-Time Push Webhooks)
  console.log("\n--- Real-Time Push Webhook (Google Cloud Pub/Sub) ---");
  console.log("Format: projects/YOUR_PROJECT_ID/topics/YOUR_TOPIC_NAME");
  console.log("(Press Enter to leave blank and use Interval Polling fallback)");
  const pubsubTopic = await askQuestion(
    "1.5 Google Pub/Sub Topic Name",
    existingEnv.GMAIL_PUBSUB_TOPIC || ""
  );

  // ============================================================================
  // STEP 2: WHATSAPP
  // ============================================================================
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║ STEP 2/5: WHATSAPP NOTIFICATIONS CONFIGURATION                 ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  const waEnabled = (await askQuestion("2.1 Enable WhatsApp Notifications? (Y/N)", existingEnv.WHATSAPP_ENABLED !== "false" ? "Y" : "N")).toUpperCase().startsWith("Y");
  let waTarget = "";
  if (waEnabled) {
    console.log("Note: Enter recipient phone (e.g. 919876543210) or leave blank for Self-Chat.");
    waTarget = await askQuestion(
      "2.2 Recipient WhatsApp Phone Number",
      existingEnv.WHATSAPP_TARGET_NUMBER || ""
    );
  }

  // ============================================================================
  // STEP 3: SLACK
  // ============================================================================
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║ STEP 3/5: SLACK DISPATCH CONFIGURATION                         ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  const slackEnabled = (await askQuestion("3.1 Enable Slack Notifications? (Y/N)", existingEnv.SLACK_ENABLED !== "false" ? "Y" : "N")).toUpperCase().startsWith("Y");
  let slackWebhook = "";
  if (slackEnabled) {
    slackWebhook = await askQuestion(
      "3.2 Paste your Slack Incoming Webhook URL (https://hooks.slack.com/services/...)",
      existingEnv.SLACK_WEBHOOK_URL || "",
      true
    );

    if (slackWebhook) {
      const testSlack = await askQuestion("3.3 Send an immediate test alert to your Slack channel now? (Y/N)", "Y");
      if (testSlack.toUpperCase().startsWith("Y")) {
        try {
          const res = await fetch(slackWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "🚨 [TEST] InboxPulse Backend Daemon successfully connected to your Slack channel!" })
          });
          if (res.ok) {
            console.log("\x1b[32m  ✔ Live test message delivered to Slack successfully!\x1b[0m");
          } else {
            console.log(`\x1b[31m  ✖ Slack returned HTTP status ${res.status}\x1b[0m`);
          }
        } catch (err: any) {
          console.error("\x1b[31m  ✖ Slack test failed:\x1b[0m", err.message);
        }
      }
    }
  }

  // ============================================================================
  // STEP 4: GEMINI AI (OPTIONAL)
  // ============================================================================
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║ STEP 4/5: GEMINI AI TRIAGING (100% OPTIONAL)                   ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  const geminiKey = await askQuestion(
    "4.1 Paste your Gemini API Key from https://aistudio.google.com/ (Press Enter to skip for Zero-AI Mode)",
    existingEnv.GEMINI_API_KEY || "",
    true
  );

  // ============================================================================
  // STEP 5: STANDING RULES & INTERVALS
  // ============================================================================
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║ STEP 5/5: STANDING RULES & DISPATCH FILTERS                    ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  const urgencyThreshold = await askQuestion(
    "5.1 Minimum Urgency Score to trigger alerts (1 to 10)",
    existingEnv.URGENCY_THRESHOLD || "7"
  );
  const vipSenders = await askQuestion(
    "5.2 VIP Senders (Comma-separated emails or names that always trigger immediate alerts)",
    existingEnv.VIP_SENDERS || "boss@company.com, client@partner.com"
  );
  const keywordFilters = await askQuestion(
    "5.3 Custom Trigger Keywords (Comma-separated phrases in subject/body)",
    existingEnv.KEYWORD_FILTERS || "daily tracker, invoice, urgent, deadline, production issue"
  );
  const pollInterval = await askQuestion(
    "5.4 Polling Frequency in seconds (Fallback check rate)",
    existingEnv.POLLING_INTERVAL_SEC || "60"
  );

  // ============================================================================
  // SAVE CONFIGURATION TO .ENV
  // ============================================================================
  const envContent = `# ==============================================================================
# EMAIL NOTIFICATION SERVICE (HEADLESS DAEMON) CONFIGURATION
# Generated by Step-by-Step CLI Setup Wizard
# ==============================================================================

# 1. GMAIL OAUTH & REAL-TIME WEBHOOK
GOOGLE_CLIENT_ID=${googleClientId}
GOOGLE_CLIENT_SECRET=${googleClientSecret}
GOOGLE_REFRESH_TOKEN=${googleRefreshToken}
GMAIL_PUBSUB_TOPIC=${pubsubTopic}

# 2. GEMINI AI TRIAGING (OPTIONAL - Zero-AI mode if left empty)
GEMINI_API_KEY=${geminiKey}

# 3. WHATSAPP DISPATCH
WHATSAPP_ENABLED=${waEnabled ? "true" : "false"}
WHATSAPP_TARGET_NUMBER=${waTarget}

# 4. SLACK DISPATCH
SLACK_ENABLED=${slackEnabled ? "true" : "false"}
SLACK_WEBHOOK_URL=${slackWebhook}

# 5. STANDING RULES & AI SENSITIVITY
URGENCY_THRESHOLD=${urgencyThreshold}
VIP_SENDERS=${vipSenders}
KEYWORD_FILTERS=${keywordFilters}
POLLING_INTERVAL_SEC=${pollInterval}
`;

  fs.writeFileSync(envPath, envContent, "utf-8");

  console.log("\n==================================================================");
  console.log("\x1b[32m✔ SUCCESS! All configurations saved securely to your .env file!\x1b[0m");
  console.log("==================================================================");
  console.log("How to run your service:");
  console.log("  • Development mode : \x1b[36mnpm run dev\x1b[0m");
  console.log("  • Production build  : \x1b[36mnpm run build && npm start\x1b[0m\n");
};

main().catch(err => {
  console.error("Setup error:", err);
  process.exit(1);
});