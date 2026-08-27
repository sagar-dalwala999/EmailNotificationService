import { google } from "googleapis";
import { config } from "../config.js";

export interface RawEmail {
  id: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

const getOAuthClient = () => {
  if (!config.google.clientId || !config.google.clientSecret || !config.google.refreshToken) {
    throw new Error("Missing Google OAuth credentials in .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)");
  }

  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: config.google.refreshToken
  });

  return oauth2Client;
};

/**
 * Registers a real-time watch subscription on Gmail with Google Cloud Pub/Sub
 */
export const watchGmail = async (topicName: string): Promise<{ historyId?: string; expiration?: string }> => {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  console.log(`[Gmail Watch] Registering real-time push watch on topic: ${topicName}`);
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"]
    }
  });

  console.log(`\x1b[32m[Gmail Watch] Active! History ID: ${res.data.historyId}, Expiration: ${new Date(Number(res.data.expiration)).toLocaleString()}\x1b[0m`);
  return {
    historyId: res.data.historyId || undefined,
    expiration: res.data.expiration || undefined
  };
};

/**
 * Stops an active Gmail watch
 */
export const stopWatchGmail = async (): Promise<void> => {
  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: "v1", auth });
    await gmail.users.stop({ userId: "me" });
    console.log("[Gmail Watch] Successfully stopped Gmail watch.");
  } catch (err: any) {
    console.warn("[Gmail Watch] Could not stop watch:", err.message);
  }
};

export const fetchUnreadEmails = async (maxResults = 10): Promise<RawEmail[]> => {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults
  });

  const messages = res.data.messages || [];
  if (messages.length === 0) return [];

  const emails: RawEmail[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    try {
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full"
      });

      const headers = fullMsg.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

      const fromRaw = getHeader("From");
      const subject = getHeader("Subject") || "(No Subject)";
      const date = getHeader("Date") || new Date().toISOString();

      let senderName = fromRaw;
      let senderEmail = fromRaw;

      const fromMatch = fromRaw.match(/(.*?)\s*<(.+?)>/);
      if (fromMatch) {
        senderName = fromMatch[1].replace(/["']/g, "").trim() || fromMatch[2];
        senderEmail = fromMatch[2].trim();
      }

      // Extract body text
      let bodyText = "";
      const extractBody = (part: any) => {
        if (part.mimeType === "text/plain" && part.body?.data) {
          bodyText += Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.parts) {
          for (const subPart of part.parts) {
            extractBody(subPart);
          }
        }
      };

      if (fullMsg.data.payload) {
        extractBody(fullMsg.data.payload);
      }

      if (!bodyText && fullMsg.data.snippet) {
        bodyText = fullMsg.data.snippet;
      }

      emails.push({
        id: msg.id,
        threadId: msg.threadId || msg.id,
        senderName,
        senderEmail,
        subject,
        date,
        snippet: fullMsg.data.snippet || bodyText.slice(0, 150),
        body: bodyText.trim()
      });
    } catch (err: any) {
      console.error(`[Gmail] Failed to fetch full message for ${msg.id}:`, err.message);
    }
  }

  return emails;
};