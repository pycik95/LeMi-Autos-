import { prisma } from "@/lib/prisma";

const REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function googleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  email: string | null;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  let email: string | null = null;
  try {
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) email = (await userRes.json()).email ?? null;
  } catch {
    // необязательно, просто для отображения на /check
  }

  return { refreshToken: data.refresh_token, accessToken: data.access_token, email };
}

/** Обменивает сохранённый refresh_token на свежий access_token. */
export async function getAccessToken(): Promise<string | null> {
  const auth = await prisma.googleAuth.findFirst({ orderBy: { createdAt: "desc" } });
  if (!auth) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: auth.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

export type GmailMessagePart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  payload?: GmailMessagePart;
};

export async function searchMessages(query: string, accessToken: string): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: "30" });
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.messages ?? []).map((m: { id: string }) => m.id);
}

export async function getMessage(id: string, accessToken: string): Promise<GmailMessage> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail getMessage failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getAttachment(
  messageId: string,
  attachmentId: string,
  accessToken: string
): Promise<Buffer> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail getAttachment failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // Gmail отдаёт вложения в base64url — заменяем на обычный base64 перед декодированием.
  const base64 = String(data.data ?? "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

export type PdfAttachmentRef = { filename: string; attachmentId: string };

/** Рекурсивно обходит части письма (multipart может быть вложенным) и собирает PDF-вложения. */
export function findPdfAttachments(payload: GmailMessagePart | undefined): PdfAttachmentRef[] {
  if (!payload) return [];
  const out: PdfAttachmentRef[] = [];
  function walk(part: GmailMessagePart) {
    if (part.filename && /\.pdf$/i.test(part.filename) && part.body?.attachmentId) {
      out.push({ filename: part.filename, attachmentId: part.body.attachmentId });
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);
  return out;
}
