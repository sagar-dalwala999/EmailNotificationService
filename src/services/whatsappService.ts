import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket
} from "@whiskeysockets/baileys";
import qrcodeTerminal from "qrcode-terminal";
import pino from "pino";
import fs from "fs";
import { config } from "../config.js";

let socket: WASocket | null = null;
let isConnected = false;
let connectedNumber: string | null = null;

const logger = pino({ level: "silent" });

export const initWhatsApp = async (): Promise<void> => {
  if (!config.whatsapp.enabled) {
    console.log("[WhatsApp] Dispatch disabled via config.");
    return;
  }

  if (!fs.existsSync(config.whatsapp.sessionDir)) {
    fs.mkdirSync(config.whatsapp.sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.whatsapp.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["InboxPulse Daemon", "Chrome", "1.0.0"],
    syncFullHistory: false,
    printQRInTerminal: false
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n=======================================================");
      console.log("  SCAN WHATSAPP QR CODE BELOW WITH LINKED DEVICES:");
      console.log("=======================================================\n");
      qrcodeTerminal.generate(qr, { small: true });
      console.log("\nOpen WhatsApp > Linked Devices > Link a Device > Scan QR.\n");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      isConnected = false;
      connectedNumber = null;

      console.log(`[WhatsApp] Connection closed (reason: ${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(initWhatsApp, 5000);
      }
    } else if (connection === "open") {
      isConnected = true;
      const userJid = socket?.user?.id || "";
      connectedNumber = userJid.split(":")[0].replace(/\D/g, "");
      console.log(`\x1b[32m[WhatsApp] Connected successfully as +${connectedNumber}\x1b[0m`);
    }
  });
};

export const sendWhatsAppNotification = async (payload: {
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
  if (!config.whatsapp.enabled || !socket || !isConnected) {
    return { success: false, error: "WhatsApp socket not connected" };
  }

  try {
    const userJid = socket.user?.id || "";
    let recipientJid = userJid;

    if (config.whatsapp.targetNumber) {
      const cleanPhone = config.whatsapp.targetNumber.replace(/\D/g, "");
      if (cleanPhone) {
        recipientJid = `${cleanPhone}@s.whatsapp.net`;
      }
    }

    const isCritical = payload.urgencyScore >= 8;
    const badge = isCritical ? "🚨 *[ CRITICAL ALERT ]*" : "⚡ *[ HIGH PRIORITY ]*";

    let messageText = `${badge}\n`;
    messageText += `*Urgency Score:* ${payload.urgencyScore}/10  |  *Tag:* ${payload.category}\n`;
    messageText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    messageText += `📧 *Subject:* ${payload.subject}\n`;
    messageText += `👤 *From:* ${payload.senderName} (<${payload.senderEmail}>)\n\n`;

    messageText += `📋 *AI Executive Summary:*\n`;
    for (const bullet of payload.summary) {
      messageText += `• ${bullet}\n`;
    }

    if (payload.actionRequired && payload.actionRequired.trim()) {
      messageText += `\n🎯 *ACTION REQUIRED:* ${payload.actionRequired}\n`;
    }

    if (payload.bodySnippet && payload.bodySnippet.trim()) {
      const cleanSnippet = payload.bodySnippet.slice(0, 400).replace(/\n\s*\n/g, "\n");
      messageText += `\n📝 *Original Message Preview:*\n`;
      messageText += `> _"${cleanSnippet}..."_\n`;
    }

    messageText += `\n🔗 *Open in Gmail:* https://mail.google.com/mail/u/0/#inbox/${payload.emailId}\n`;
    messageText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    messageText += `_InboxPulse Multi-Channel Service_`;

    await socket.sendMessage(recipientJid, { text: messageText });
    return { success: true };
  } catch (err: any) {
    console.error("[WhatsApp] Message delivery failed:", err.message);
    return { success: false, error: err.message };
  }
};