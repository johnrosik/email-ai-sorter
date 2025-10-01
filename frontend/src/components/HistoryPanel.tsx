import { CheckCircleIcon, ExclamationCircleIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { ClockIcon, DocumentTextIcon, PaperClipIcon } from "@heroicons/react/24/solid";
import type { ClassificationHistoryEntry } from "../types";

type HistoryPanelProps = {
  history: ClassificationHistoryEntry[];
  activeId: string | null;
  onSelect: (entry: ClassificationHistoryEntry) => void;
  onOpenDetail?: (entry: ClassificationHistoryEntry) => void;
};

export type StatusConfig = {
  label: string;
  accent: string;
  highlight: string;
  Icon: typeof CheckCircleIcon;
};

export function getStatusConfig(entry: ClassificationHistoryEntry): StatusConfig {
  if (entry.result.productive === null) {
    return {
      label: "Inconclusivo",
      accent: "text-slate-300",
      highlight: "bg-white/10",
      Icon: QuestionMarkCircleIcon
    };
  }

  if (entry.result.productive) {
    return {
      label: "Produtivo",
      accent: "text-brand-200",
      highlight: "bg-brand-500/15",
      Icon: CheckCircleIcon
    };
  }

  return {
    label: "Não produtivo",
    accent: "text-red-200",
    highlight: "bg-red-500/15",
    Icon: ExclamationCircleIcon
  };
}

export function HistoryPanel({ history, activeId, onSelect, onOpenDetail }: HistoryPanelProps) {
  if (history.length === 0) {
    return (
      <section className="rounded-3xl border border-white/10 bg-black/50 p-6 text-sm text-slate-300/80">
        <h3 className="text-base font-semibold text-white">Histórico de análises</h3>
        <p className="mt-3 text-slate-400/80">
          Os emails analisados aparecerão aqui para você consultar os resultados recentes.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold uppercase tracking-[0.35em] text-slate-300">Histórico de análises</h3>
        <p className="text-xs text-slate-500">{history.length} análise(s) recente(s)</p>
      </div>

      <div className="space-y-4">
        {history.map((entry) => {
          const status = getStatusConfig(entry);
          const isActive = entry.id === activeId;
          const confidenceValue = typeof entry.result.confidence === "number" && !Number.isNaN(entry.result.confidence)
            ? Math.round(entry.result.confidence * 100)
            : null;
          const formattedDate = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short"
          }).format(new Date(entry.timestamp));

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                onSelect(entry);
                onOpenDetail?.(entry);
              }}
              aria-pressed={isActive}
              className={`w-full rounded-3xl border bg-black/60 p-5 text-left transition focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60 ${
                isActive ? "border-brand-400/50 shadow-[0_20px_40px_rgba(212,136,7,0.25)]" : "border-white/10 hover:border-brand-300/40"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full ${status.highlight}`}>
                    <status.Icon className={`h-6 w-6 ${status.accent}`} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">{status.label}</p>
                    <p className="line-clamp-1 text-sm font-semibold text-slate-200">{entry.preview}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500/90">
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" aria-hidden="true" />
                        {formattedDate}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {entry.inputKind === "file" ? (
                          <PaperClipIcon className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <DocumentTextIcon className="h-4 w-4" aria-hidden="true" />
                        )}
                        {entry.inputLabel}
                      </span>
                      {confidenceValue !== null && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden="true" />
                          {confidenceValue}% confiabilidade
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
