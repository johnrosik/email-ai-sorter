import type { ClassificationRequest, ClassificationResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export async function classifyEmail({ emailText, file }: ClassificationRequest): Promise<ClassificationResponse> {
  const trimmedText = emailText?.trim() ?? "";

  if (!file && !trimmedText) {
    throw new Error("É necessário fornecer um texto de email ou anexar um arquivo.");
  }

  const url = `${API_BASE_URL}/classify-email`;

  const response = await (async () => {
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      if (trimmedText) {
        formData.append("email_text", trimmedText);
      }
      return fetch(url, {
        method: "POST",
        body: formData
      });
    }

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email_text: trimmedText })
    });
  })();

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (typeof payload?.error === "string") {
        message = payload.error;
      }
    } catch (error) {
      // ignore JSON parsing errors and use default message
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as Partial<ClassificationResponse> & Record<string, unknown>;

  const normalizedKeywords = Array.isArray(payload.keywords)
    ? payload.keywords.filter((keyword): keyword is string => typeof keyword === "string")
    : null;

  return {
    productive: payload.productive ?? null,
    confidence: payload.confidence ?? null,
    reason: payload.reason ?? null,
    keywords: normalizedKeywords,
    reply: typeof payload.reply === "string" && payload.reply.trim() ? payload.reply.trim() : null,
    error: typeof payload.error === "string" && payload.error ? payload.error : null
  };
}
