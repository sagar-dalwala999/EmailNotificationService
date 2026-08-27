import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "processed.db"));

// Enable WAL mode for high concurrency
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS processed_emails (
    id TEXT PRIMARY KEY,
    subject TEXT,
    sender TEXT,
    urgency_score INTEGER,
    status TEXT,
    dispatched_channels TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_processed_emails_processed_at ON processed_emails(processed_at);
`);

export interface ProcessedRecord {
  id: string;
  subject: string;
  sender: string;
  urgency_score: number;
  status: "NOTIFIED" | "SKIPPED";
  dispatched_channels: string;
}

export const isEmailProcessed = (emailId: string): boolean => {
  const row = db.prepare("SELECT id FROM processed_emails WHERE id = ?").get(emailId);
  return Boolean(row);
};

export const recordProcessedEmail = (record: ProcessedRecord): void => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO processed_emails (id, subject, sender, urgency_score, status, dispatched_channels, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(
    record.id,
    record.subject,
    record.sender,
    record.urgency_score,
    record.status,
    record.dispatched_channels
  );
};