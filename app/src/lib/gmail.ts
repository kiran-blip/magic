import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/email/auth/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Token storage (in production, use a database)
let storedTokens: {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
} | null = null;

export function getAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function handleAuthCallback(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  storedTokens = {
    access_token: tokens.access_token || "",
    refresh_token: tokens.refresh_token || "",
    expiry_date: tokens.expiry_date || 0,
  };
  return tokens;
}

export function isAuthenticated(): boolean {
  return storedTokens !== null && !!storedTokens.refresh_token;
}

function getAuthedClient(): gmail_v1.Gmail {
  if (!storedTokens) {
    throw new Error("Not authenticated with Gmail");
  }
  const client = getOAuthClient();
  client.setCredentials(storedTokens);
  return google.gmail({ version: "v1", auth: client });
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  labels: string[];
  isUnread: boolean;
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  // Simple text body
  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Multipart — find text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    // Nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

function parseMessage(msg: gmail_v1.Schema$Message): EmailMessage {
  const headers = msg.payload?.headers;
  return {
    id: msg.id || "",
    threadId: msg.threadId || "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    snippet: msg.snippet || "",
    body: extractBody(msg.payload),
    date: getHeader(headers, "Date"),
    labels: msg.labelIds || [],
    isUnread: msg.labelIds?.includes("UNREAD") || false,
  };
}

export async function listEmails(
  maxResults: number = 20,
  query: string = ""
): Promise<EmailMessage[]> {
  const gmail = getAuthedClient();
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: query || undefined,
  });

  if (!res.data.messages) return [];

  // Fetch all messages in parallel with metadata format (fast)
  const emails = await Promise.all(
    res.data.messages.map(async (item) => {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: item.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });
      const headers = msg.data.payload?.headers;
      return {
        id: msg.data.id || "",
        threadId: msg.data.threadId || "",
        from: getHeader(headers, "From"),
        to: getHeader(headers, "To"),
        subject: getHeader(headers, "Subject"),
        snippet: msg.data.snippet || "",
        body: "", // Only fetched when opening a single email
        date: getHeader(headers, "Date"),
        labels: msg.data.labelIds || [],
        isUnread: msg.data.labelIds?.includes("UNREAD") || false,
      };
    })
  );

  return emails;
}

export async function getEmail(id: string): Promise<EmailMessage> {
  const gmail = getAuthedClient();
  const msg = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  return parseMessage(msg.data);
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<string> {
  const gmail = getAuthedClient();

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return res.data.id || "";
}

export async function replyToEmail(
  messageId: string,
  threadId: string,
  to: string,
  subject: string,
  body: string
): Promise<string> {
  const gmail = getAuthedClient();

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nIn-Reply-To: ${messageId}\r\nReferences: ${messageId}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });

  return res.data.id || "";
}

export async function markAsRead(id: string): Promise<void> {
  const gmail = getAuthedClient();
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

export async function archiveEmail(id: string): Promise<void> {
  const gmail = getAuthedClient();
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: { removeLabelIds: ["INBOX"] },
  });
}

export async function trashEmail(id: string): Promise<void> {
  const gmail = getAuthedClient();
  await gmail.users.messages.trash({ userId: "me", id });
}

export async function getLabels(): Promise<gmail_v1.Schema$Label[]> {
  const gmail = getAuthedClient();
  const res = await gmail.users.labels.list({ userId: "me" });
  return res.data.labels || [];
}

// MCP-style tool definitions for Claude
export const emailTools = [
  {
    name: "list_emails",
    description:
      "List recent emails from Gmail inbox. Can search with Gmail query syntax.",
    input_schema: {
      type: "object" as const,
      properties: {
        max_results: {
          type: "number",
          description: "Max emails to return (default 10)",
        },
        query: {
          type: "string",
          description:
            "Gmail search query (e.g. 'is:unread', 'from:boss@company.com', 'subject:invoice')",
        },
      },
    },
  },
  {
    name: "get_email",
    description: "Get the full content of a specific email by its ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Email message ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "send_email",
    description: "Send a new email.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "reply_to_email",
    description: "Reply to an existing email thread.",
    input_schema: {
      type: "object" as const,
      properties: {
        message_id: { type: "string", description: "Original message ID" },
        thread_id: { type: "string", description: "Thread ID" },
        to: { type: "string", description: "Recipient" },
        subject: { type: "string", description: "Subject (usually Re: ...)" },
        body: { type: "string", description: "Reply body" },
      },
      required: ["message_id", "thread_id", "to", "subject", "body"],
    },
  },
  {
    name: "archive_email",
    description: "Archive an email (remove from inbox).",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Email message ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "trash_email",
    description: "Move an email to trash.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Email message ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "mark_as_read",
    description: "Mark an email as read.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Email message ID" },
      },
      required: ["id"],
    },
  },
];

// Execute a tool call from Claude
export async function executeEmailTool(
  toolName: string,
  input: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "list_emails": {
      const emails = await listEmails(input.max_results || 10, input.query || "");
      return JSON.stringify(
        emails.map((e) => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          date: e.date,
          snippet: e.snippet,
          isUnread: e.isUnread,
        })),
        null,
        2
      );
    }
    case "get_email": {
      const email = await getEmail(input.id);
      return JSON.stringify(email, null, 2);
    }
    case "send_email": {
      const id = await sendEmail(input.to, input.subject, input.body);
      return `Email sent successfully. Message ID: ${id}`;
    }
    case "reply_to_email": {
      const id = await replyToEmail(
        input.message_id,
        input.thread_id,
        input.to,
        input.subject,
        input.body
      );
      return `Reply sent successfully. Message ID: ${id}`;
    }
    case "archive_email": {
      await archiveEmail(input.id);
      return `Email ${input.id} archived.`;
    }
    case "trash_email": {
      await trashEmail(input.id);
      return `Email ${input.id} moved to trash.`;
    }
    case "mark_as_read": {
      await markAsRead(input.id);
      return `Email ${input.id} marked as read.`;
    }
    default:
      return `Unknown tool: ${toolName}`;
  }
}
