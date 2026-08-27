import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import type { RawEmail } from "./gmailService.js";

export interface AIAnalysisResult {
  urgencyScore: number;
  category: string;
  summary: string[];
  actionRequired: string | null;
  reasoning: string;
}

function parseJsonSafely(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {}

  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (e) {}
  }

  return {};
}

export const analyzeEmail = async (email: RawEmail): Promise<AIAnalysisResult> => {
  if (!config.gemini.apiKey) {
    return {
      urgencyScore: 5,
      category: "Uncategorized",
      summary: [email.snippet || email.subject],
      actionRequired: null,
      reasoning: "GEMINI_API_KEY not configured"
    };
  }

  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
You are an executive email triage assistant. Analyze this email and output strict JSON.

Sender: ${email.senderName} <${email.senderEmail}>
Subject: ${email.subject}
Date: ${email.date}
Snippet: ${email.snippet}
Content:
${email.body.slice(0, 3000)}

Instructions:
1. "urgencyScore": integer 1-10 (1 = junk/digest/promo, 5 = normal info, 7 = important/needs review, 9-10 = critical/urgent/deadline/system emergency).
2. "category": concise label (e.g. "Work Action", "Client Request", "Meeting", "System Alert", "Finance", "Newsletter").
3. "summary": array of 1-3 bullet strings summarizing core context clearly.
4. "actionRequired": concise single line if an action is needed from recipient, or null if none.
5. "reasoning": brief explanation for urgency score.

Respond ONLY with valid JSON:
{
  "urgencyScore": 8,
  "category": "Work Action",
  "summary": ["Point 1", "Point 2"],
  "actionRequired": "Review document by 5 PM",
  "reasoning": "Direct action item with deadline."
}
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = parseJsonSafely(text);

    return {
      urgencyScore: typeof parsed.urgencyScore === "number" ? parsed.urgencyScore : 5,
      category: parsed.category || "General",
      summary: Array.isArray(parsed.summary) && parsed.summary.length > 0 ? parsed.summary : [email.snippet || email.subject],
      actionRequired: parsed.actionRequired || null,
      reasoning: parsed.reasoning || ""
    };
  } catch (err: any) {
    console.error("[Gemini] Analysis failed, falling back to heuristics:", err.message);
    return {
      urgencyScore: 5,
      category: "Uncategorized",
      summary: [email.snippet || email.subject],
      actionRequired: null,
      reasoning: "AI analysis unavailable"
    };
  }
};