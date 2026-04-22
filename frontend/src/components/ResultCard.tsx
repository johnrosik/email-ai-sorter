import { useEffect, useState } from "react";
import { CheckCircleIcon, ClipboardDocumentIcon, ExclamationCircleIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import type { ClassificationResponse } from "../types";

type ResultCardProps = {
  result: ClassificationResponse | null;
  isLoading: boolean;
  error: string | null;
};

export function ResultCard({ result, isLoading, error }: ResultCardProps) {
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "error" | null>(null);

  useEffect(() => {
    if (!copyFeedback) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setCopyFeedback(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copyFeedback]);

  const handleCopyReply = async (reply: string) => {
    if (!reply) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reply);
        setCopyFeedback("copied");
        return;
      }
    } catch (clipboardError) {
      console.error("Falha ao copiar resposta:", clipboardError);
    }

    try {
      if (typeof document === "undefined") throw new Error("Documento indisponível para fallback de cópia.");
      const textarea = document.createElement("textarea");
      textarea.value = reply;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopyFeedback("copied");
    } catch (fallbackError) {
      console.error("Fallback de cópia falhou:", fallbackError);
      setCopyFeedback("error");
    }
  };

  if (isLoading) {
    return (
      <section className="mt-8 flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-3xl bg-[#0d422d] p-8 text-center text-slate-200 shadow-[0_30px_70px_rgba(0,0,0,0.35)]">
        <span className="flex h-14 w-14 animate-spin items-center justify-center rounded-full border-2 border-brand-400/30 border-t-brand-200/90" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Processando</p>
          <p className="animate-pulse text-base font-medium text-brand-100">Analisando o e-mail e gerando uma resposta...</p>
          <p className="text-xs text-slate-200/70">Isso pode levar alguns segundos.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6 rounded-xl bg-red-950/55 p-6 text-sm text-red-200 shadow-lg shadow-red-900/20">
        <div className="flex items-center gap-3">
          <ExclamationCircleIcon className="h-6 w-6" aria-hidden="true" />
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (!result) return null;

  const status = result.productive === null
    ? {
        label: "Inconclusivo",
        description: "O modelo não conseguiu determinar a produtividade desta mensagem.",
        accent: "text-slate-300",
        highlight: "bg-white/10",
        Icon: QuestionMarkCircleIcon
      }
    : result.productive
    ? {
        label: "Produtivo",
        description: "Esta mensagem contribui para o fluxo de trabalho.",
        accent: "text-brand-200",
        highlight: "bg-brand-500/18",
        Icon: CheckCircleIcon
      }
    : {
        label: "Não produtivo",
        description: "Considere arquivar ou responder rapidamente para liberar espaço.",
        accent: "text-red-200",
        highlight: "bg-red-500/15",
        Icon: ExclamationCircleIcon
      };

  const { Icon } = status;
  const confidenceValue = typeof result.confidence === "number" && !Number.isNaN(result.confidence) ? result.confidence : null;

  return (
    <section className="mt-8 rounded-3xl bg-[#0d422d] p-8 text-slate-100 shadow-[0_30px_70px_rgba(0,0,0,0.35)]" aria-live="polite">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${status.highlight}`}>
            <Icon className={`h-7 w-7 ${status.accent}`} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Resultado da classificação</p>
            <h2 className={`text-2xl font-semibold ${status.accent}`}>{status.label}</h2>
            <p className="text-xs text-slate-200/75">{status.description}</p>
          </div>
        </div>
      </header>

      {confidenceValue !== null && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Confiabilidade</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/20">
            <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${Math.min(100, Math.max(0, confidenceValue * 100)).toFixed(2)}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-100/90">{(confidenceValue * 100).toFixed(1)}%</p>
        </div>
      )}

      {result.reason && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Motivo</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-100/90">{result.reason}</p>
        </div>
      )}

      {result.keywords && result.keywords.length > 0 && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Palavras-chave detectadas</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {result.keywords.map((keyword) => (
              <span key={keyword} className="rounded-full bg-[#165339] px-3 py-1 text-xs uppercase tracking-[0.3em] text-brand-100">#{keyword}</span>
            ))}
          </div>
        </div>
      )}

      {result.reply && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Resposta sugerida</p>
            <button
              type="button"
              onClick={() => handleCopyReply(result.reply ?? "")}
              className="inline-flex items-center gap-2 rounded-full bg-[#165339] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-brand-100 transition hover:bg-[#1d6b48] hover:text-brand-50 focus:outline-none focus-visible:ring focus-visible:ring-brand-300/50"
            >
              <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
              Copiar resposta
            </button>
          </div>
          <blockquote className="rounded-2xl bg-[#11472f] p-5 text-sm text-slate-100/90">{result.reply}</blockquote>
          {copyFeedback && (
            <p className={`text-xs ${copyFeedback === "copied" ? "text-brand-100" : "text-red-200"}`} role="status" aria-live="assertive">
              {copyFeedback === "copied" ? "Resposta copiada para a área de transferência." : "Não foi possível copiar a resposta."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
