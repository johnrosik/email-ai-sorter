import { CheckCircleIcon, ExclamationCircleIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import type { ClassificationResponse } from "../types";

type ResultCardProps = {
  result: ClassificationResponse | null;
  isLoading: boolean;
  error: string | null;
};

export function ResultCard({ result, isLoading, error }: ResultCardProps) {
  if (isLoading) {
    return (
      <section className="mt-6 rounded-xl border border-brand-500/40 bg-slate-900/70 p-6 text-sm text-slate-200 shadow-lg shadow-brand-900/20">
        <p className="animate-pulse text-brand-200">Consulting Gemini...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6 rounded-xl border border-red-500/40 bg-red-950/40 p-6 text-sm text-red-200 shadow-lg shadow-red-900/20">
        <div className="flex items-center gap-3">
          <ExclamationCircleIcon className="h-6 w-6" aria-hidden="true" />
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (!result) {
    return null;
  }

  const status = result.productive === null
    ? {
        label: "Inconclusivo",
        description: "O modelo não conseguiu determinar a produtividade desta mensagem.",
        accent: "text-slate-300",
        border: "border-white/20",
        highlight: "bg-white/10",
        Icon: QuestionMarkCircleIcon
      }
    : result.productive
    ? {
        label: "Produtivo",
        description: "Esta mensagem contribui para o fluxo de trabalho.",
        accent: "text-brand-200",
        border: "border-brand-400/40",
        highlight: "bg-brand-500/15",
        Icon: CheckCircleIcon
      }
    : {
        label: "Não produtivo",
        description: "Considere arquivar ou responder rapidamente para liberar espaço.",
        accent: "text-red-200",
        border: "border-red-400/40",
        highlight: "bg-red-500/15",
        Icon: ExclamationCircleIcon
      };

  const { Icon } = status;
  const confidenceValue = typeof result.confidence === "number" && !Number.isNaN(result.confidence) ? result.confidence : null;

  return (
    <section
      className={`mt-8 rounded-3xl border ${status.border} bg-black/65 p-8 text-slate-100 shadow-[0_30px_70px_rgba(0,0,0,0.55)]`}
      aria-live="polite"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${status.highlight}`}>
            <Icon className={`h-7 w-7 ${status.accent}`} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Resultado da classificação</p>
            <h2 className={`text-2xl font-semibold ${status.accent}`}>{status.label}</h2>
            <p className="text-xs text-slate-400/80">{status.description}</p>
          </div>
        </div>
      </header>

      {confidenceValue !== null && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Confiabilidade</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brand-400 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, confidenceValue * 100)).toFixed(2)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-300/90">{(confidenceValue * 100).toFixed(1)}%</p>
        </div>
      )}

      {result.reason && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Motivo</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200/90">{result.reason}</p>
        </div>
      )}

      {result.keywords && result.keywords.length > 0 && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Palavras-chave detectadas</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {result.keywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-200/80"
              >
                #{keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.reply && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Resposta sugerida</p>
          <blockquote className="mt-3 rounded-2xl border border-brand-400/30 bg-brand-500/10 p-5 text-sm text-slate-100/90">
            {result.reply}
          </blockquote>
        </div>
      )}
    </section>
  );
}
