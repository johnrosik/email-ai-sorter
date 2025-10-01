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
