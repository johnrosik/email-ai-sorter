export interface ClassificationRequest {
  emailText?: string;
  file?: File | null;
}

export interface ClassificationResponse {
  productive: boolean | null;
  confidence: number | null;
  reason: string | null;
  keywords: string[] | null;
  reply: string | null;
  error?: string | null;
}

export interface ClassificationHistoryEntry {
  id: string;
  timestamp: number;
  inputKind: "text" | "file";
  inputLabel: string;
  preview: string;
  inputContent?: string | null;
  result: ClassificationResponse;
}

export interface GmailSessionStatus {
  connected: boolean;
  email: string | null;
  messages_total: number | null;
}

export interface GmailAnalyzedMessage {
  id: string;
  thread_id: string | null;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  classification: ClassificationResponse;
}

export interface GmailAnalyzeResponse {
  count: number;
  query: string;
  max_results: number;
  items: GmailAnalyzedMessage[];
}
