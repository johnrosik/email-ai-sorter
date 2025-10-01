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
