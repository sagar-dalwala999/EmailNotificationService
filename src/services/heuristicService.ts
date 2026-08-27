import type { RawEmail } from "./gmailService.js";
import { config } from "../config.js";

export interface TriageResult {
  urgencyScore: number;
  category: string;
  summary: string[];
  actionRequired: string | null;
  reasoning: string;
  source: "VIP" | "KEYWORD" | "HEURISTIC" | "AI";
}

// Common patterns for high-priority email subjects & bodies
const CRITICAL_KEYWORDS = [
  "urgent", "action required", "asap", "emergency", "critical",
  "server down", "outage", "production issue", "security alert",
  "unauthorized", "data breach", "p0", "p1", "immediate attention"
];

const IMPORTANT_KEYWORDS = [
  "deadline", "due today", "reminder", "approval needed", "please approve",
  "invoice", "payment due", "overdue", "contract", "time sensitive",
  "meeting update", "client request", "rescheduled", "action needed"
];

const BULK_INDICATORS = [
  "unsubscribe", "newsletter", "promotions", "marketing", "digest",
  "weekly recap", "no-reply", "noreply", "automated notification"
];

/**
 * Extracts 1-3 clean, informative sentences from raw email body.
 */
export const extractHeuristicSummary = (bodyText: string, snippet: string): string[] => {
  const clean = (bodyText || snippet || "")
    .replace(/\r\n/g, "\n")
    // Remove common greetings
    .replace(/^(hi|hello|dear|hey)\s+[^,\n]+[,:\n]/im, "")
    // Remove signatures
    .replace(/\n(thanks|regards|best regards|cheers|sincerely)[\s\S]*$/im, "")
    .trim();

  const lines = clean
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 15 && !l.startsWith(">") && !l.startsWith("http"));

  if (lines.length > 0) {
    return lines.slice(0, 3);
  }

  return [snippet || "(No preview text available)"];
};

/**
 * Extracts action item sentence if present in text.
 */
export const extractHeuristicAction = (text: string): string | null => {
  const actionPatterns = [
    /(?:please|kindly|need you to|action required:?|required action:?|task:?)\s+([^.!?\n]{10,120}[.!?])/i,
    /(?:make sure to|ensure to|don't forget to|review and)\s+([^.!?\n]{10,120}[.!?])/i
  ];

  for (const pattern of actionPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
};

/**
 * Evaluates email using rules and heuristic keyword/metadata analysis without requiring AI.
 */
export const evaluateHeuristically = (email: RawEmail): TriageResult => {
  const content = `${email.subject} ${email.body} ${email.snippet}`.toLowerCase();
  const subjectLower = email.subject.toLowerCase();
  const senderLower = `${email.senderName} ${email.senderEmail}`.toLowerCase();

  // 1. Check VIP Senders from .env
  const matchedVip = config.rules.vipSenders.find(vip => senderLower.includes(vip));
  if (matchedVip) {
    return {
      urgencyScore: 9,
      category: `VIP Sender: ${email.senderName || email.senderEmail}`,
      summary: extractHeuristicSummary(email.body, email.snippet),
      actionRequired: extractHeuristicAction(email.body) || "Review VIP email",
      reasoning: `Sender matched VIP registry (${matchedVip})`,
      source: "VIP"
    };
  }

  // 2. Check Custom Keyword Filters from .env
  const matchedKeyword = config.rules.keywordFilters.find(kw => content.includes(kw));
  if (matchedKeyword) {
    return {
      urgencyScore: 9,
      category: `Keyword Match: "${matchedKeyword}"`,
      summary: extractHeuristicSummary(email.body, email.snippet),
      actionRequired: extractHeuristicAction(email.body) || `Action required regarding ${matchedKeyword}`,
      reasoning: `Matched standing keyword trigger "${matchedKeyword}"`,
      source: "KEYWORD"
    };
  }

  // 3. Check for Bulk / Newsletter indicators
  const isBulk = BULK_INDICATORS.some(kw => content.includes(kw));
  if (isBulk && !CRITICAL_KEYWORDS.some(kw => subjectLower.includes(kw))) {
    return {
      urgencyScore: 2,
      category: "Newsletter / Automated",
      summary: [email.snippet || email.subject],
      actionRequired: null,
      reasoning: "Contains bulk/newsletter indicator",
      source: "HEURISTIC"
    };
  }

  // 4. Check Critical Keywords
  const foundCritical = CRITICAL_KEYWORDS.find(kw => content.includes(kw));
  if (foundCritical) {
    return {
      urgencyScore: 8,
      category: "Critical Alert",
      summary: extractHeuristicSummary(email.body, email.snippet),
      actionRequired: extractHeuristicAction(email.body) || "Immediate attention required",
      reasoning: `Matched critical phrase "${foundCritical}"`,
      source: "HEURISTIC"
    };
  }

  // 5. Check Important Keywords
  const foundImportant = IMPORTANT_KEYWORDS.find(kw => content.includes(kw));
  if (foundImportant) {
    return {
      urgencyScore: 7,
      category: "Important Action",
      summary: extractHeuristicSummary(email.body, email.snippet),
      actionRequired: extractHeuristicAction(email.body),
      reasoning: `Matched important phrase "${foundImportant}"`,
      source: "HEURISTIC"
    };
  }

  // 6. Subject capitalization or exclamation signals
  if (/[A-Z\s]{8,}/.test(email.subject) && email.subject.length > 8) {
    return {
      urgencyScore: 7,
      category: "High Priority",
      summary: extractHeuristicSummary(email.body, email.snippet),
      actionRequired: extractHeuristicAction(email.body),
      reasoning: "All-caps emphasized subject line",
      source: "HEURISTIC"
    };
  }

  // Default Standard Email
  return {
    urgencyScore: 4,
    category: "General Update",
    summary: extractHeuristicSummary(email.body, email.snippet),
    actionRequired: extractHeuristicAction(email.body),
    reasoning: "Standard routine email",
    source: "HEURISTIC"
  };
};