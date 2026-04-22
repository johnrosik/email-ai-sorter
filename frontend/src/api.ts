import type {
  ClassificationRequest,
  ClassificationResponse,
  GmailAnalyzeResponse,
  GmailSessionStatus
} from "./types";

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

export async function getGmailAuthUrl(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/gmail/auth-url`, {
      method: "GET",
      credentials: "include"
    });
  } catch {
    throw new Error(`Falha de rede/CORS ao conectar Gmail. Verifique VITE_API_BASE_URL e CORS_ORIGINS. API atual: ${API_BASE_URL}`);
  }

  if (!response.ok) {
    throw new Error("Não foi possível iniciar conexão com Gmail.");
  }

  const payload = (await response.json()) as { auth_url?: string; error?: string };
  if (!payload.auth_url) {
    throw new Error(payload.error || "URL de autenticação inválida.");
  }
  return payload.auth_url;
}

export async function getGmailSessionStatus(): Promise<GmailSessionStatus> {
  const response = await fetch(`${API_BASE_URL}/gmail/session-status`, {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    return { connected: false, email: null, messages_total: null };
  }

  const payload = (await response.json()) as Partial<GmailSessionStatus>;
  return {
    connected: Boolean(payload.connected),
    email: typeof payload.email === "string" ? payload.email : null,
    messages_total: typeof payload.messages_total === "number" ? payload.messages_total : null
  };
}

export async function disconnectGmailSession(): Promise<void> {
  await fetch(`${API_BASE_URL}/gmail/disconnect`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });
}

export async function analyzeGmailInbox(params: {
  maxResults: number;
  query: string;
}): Promise<GmailAnalyzeResponse> {
  const response = await fetch(`${API_BASE_URL}/gmail/analyze-inbox`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      max_results: params.maxResults,
      query: params.query
    })
  });

  if (!response.ok) {
    let message = "Falha ao analisar inbox do Gmail.";
    try {
      const payload = await response.json();
      if (typeof payload?.error === "string") {
        message = payload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as GmailAnalyzeResponse;
  return payload;
}
