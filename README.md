# 📬 InboxPulse Email Notification Service (Headless Daemon)

A standalone, lightweight, headless background service that automatically monitors Gmail, performs intelligent AI or rule-based triage, and delivers real-time priority alerts to **WhatsApp** and **Slack**.

---

## 🌟 Key Features

- **Dual Ingestion Modes:**
  - **Standard Polling (Default Mode):** Automatically checks Gmail periodically every `N` seconds (`POLLING_INTERVAL_SEC`). Zero-config, works out of the box without any Pub/Sub or webhook setup!
  - **Real-Time Webhook (Advanced Mode):** If `GMAIL_PUBSUB_TOPIC` is configured, switches to **0-latency instant push notifications** via Google Cloud Pub/Sub with zero idle CPU load.
- **Dual-Mode Triaging:**
  - **AI-Enhanced:** Uses Google Gemini 2.5 Flash for deep executive summaries, urgency scoring (1–10), and action extraction.
  - **Zero-AI / Heuristic Engine:** 100% functional without an API key! Evaluates VIP sender lists, keyword filters, and built-in urgency patterns.
- **Multi-Channel Dispatch:**
  - **WhatsApp:** Baileys multi-device socket with **Terminal ASCII QR Code** on first run.
  - **Slack:** Rich Block Kit formatting with headers, AI takeaways, action callouts, and direct Gmail thread links.
- **Dual Configuration Modes:**
  - **Interactive CLI Setup Wizard (`npm run setup`):** Guided step-by-step setup in your terminal.
  - **Direct `.env` File Mode:** Copy `.env.example` to `.env` and configure directly.
- **SQLite Cache:** Automatically tracks processed emails in `data/processed.db` to eliminate duplicate notifications.

---

## 🚀 Quick Start Guide

```powershell
# 1. Navigate to the project directory
cd D:\projects\EmailNotificationService

# 2. Install dependencies
npm install

# 3. Configure credentials
npm run setup

# 4. Start the service
npm run dev
```

---

## ⚙️ Ingestion Modes Explained

### 1. Default Mode: Standard Interval Polling (Simplest)
If you **do not** configure a Pub/Sub topic, the service runs in **Standard Polling Mode**:
- Checks Gmail every `POLLING_INTERVAL_SEC` seconds (default: 60s).
- **No Google Cloud Pub/Sub, no webhooks, and no public URLs required!**
- Ideal for quick local setups and simple deployments.

### 2. Advanced Mode: Real-Time Push Webhooks (0ms Latency)
If `GMAIL_PUBSUB_TOPIC` is provided in `.env`:
- The daemon registers a real-time watch with Gmail (`gmail.users.watch`).
- Google Cloud Pub/Sub pushes incoming email events to `POST /api/webhook/gmail`.
- Instant alerts (sub-second delivery) with **zero server polling overhead**!

---

## 📋 Environment Configuration Reference (`.env`)

```ini
# ==============================================================================
# 1. GMAIL OAUTH CREDENTIALS (REQUIRED)
# ==============================================================================
GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_secret
GOOGLE_REFRESH_TOKEN=1//04your_refresh_token

# ==============================================================================
# 2. GEMINI AI TRIAGING (OPTIONAL - Leave blank for Zero-AI Mode)
# ==============================================================================
GEMINI_API_KEY=AIzaSy...

# ==============================================================================
# 3. WHATSAPP DISPATCH CONFIGURATION
# ==============================================================================
WHATSAPP_ENABLED=true
# Recipient phone with country code (e.g. 919876543210). Leave blank for Self-Chat.
WHATSAPP_TARGET_NUMBER=919876543210

# ==============================================================================
# 4. SLACK DISPATCH CONFIGURATION
# ==============================================================================
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/XXXXX

# ==============================================================================
# 5. STANDING RULES & POLLING INTERVAL (DEFAULT MODE)
# ==============================================================================
URGENCY_THRESHOLD=7
VIP_SENDERS=boss@company.com,client@partner.com,hr@company.com
KEYWORD_FILTERS=daily tracker,invoice,urgent,deadline,production issue,payment
POLLING_INTERVAL_SEC=60

# ==============================================================================
# 6. ADVANCED (OPTIONAL): REAL-TIME PUSH WEBHOOK VIA GOOGLE CLOUD PUB/SUB
# ==============================================================================
# Leave BLANK for default Polling mode, or enter topic for 0ms Webhook mode:
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
PORT=5000
```

---

## 🏃 Running in Production

```powershell
# Compile TypeScript to dist/
npm run build

# Start the compiled daemon
npm start
```