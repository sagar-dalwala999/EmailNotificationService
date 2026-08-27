import { google } from "googleapis";
import readline from "readline";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("\x1b[31mError: Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file first.\x1b[0m");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:5000/api/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email"
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent"
});

console.log("\n==================================================================");
console.log("             GMAIL OAUTH REFRESH TOKEN GENERATOR                  ");
console.log("==================================================================");
console.log("\n1. Open the following authorization link in your browser:\n");
console.log(`\x1b[34m${authUrl}\x1b[0m\n`);
console.log("2. Sign in with your Google account and grant permissions.");
console.log("3. Copy the redirected URL (or 'code' parameter) from your browser address bar.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Paste redirected URL or code here: ", async (redirectInput) => {
  rl.close();
  try {
    let code = redirectInput.trim();
    if (code.includes("code=")) {
      const urlObj = new URL(code.startsWith("http") ? code : `http://localhost/${code}`);
      code = urlObj.searchParams.get("code") || code;
    }

    const { tokens } = await oauth2Client.getToken(code);
    if (tokens.refresh_token) {
      if (fs.existsSync(envPath)) {
        let envText = fs.readFileSync(envPath, "utf-8");
        if (envText.includes("GOOGLE_REFRESH_TOKEN=")) {
          envText = envText.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        } else {
          envText += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
        }
        fs.writeFileSync(envPath, envText, "utf-8");
      }
      console.log("\n\x1b[32m✔ SUCCESS! Google Refresh Token acquired and securely saved to .env!\x1b[0m\n");
    } else {
      console.log("\n\x1b[33m✔ Authorization verified. (Using existing active refresh token).\x1b[0m\n");
    }
  } catch (err: any) {
    console.error("\x1b[31mFailed to exchange authorization code:\x1b[0m", err.message);
  }
});