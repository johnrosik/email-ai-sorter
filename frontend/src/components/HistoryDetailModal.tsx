import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import type { ClassificationHistoryEntry } from "../types";
import { getStatusConfig } from "./HistoryPanel";

interface HistoryDetailModalProps {
  entry: ClassificationHistoryEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryDetailModal({ entry, isOpen, onClose }: HistoryDetailModalProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const status = useMemo(() => (entry ? getStatusConfig(entry) : null), [entry]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCopyStatus("idle");
  }, [isOpen, entry?.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const timer = window.setTimeout(() => setCopyStatus("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleCopyResponse = async () => {
    if (!entry || !entry.result.reply) {
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(entry.result.reply);
        setCopyStatus("success");
        return;
      }

      if (typeof document === "undefined") {
        throw new Error("Ambiente sem suporte a clipboard");
      }

      const textArea = document.createElement("textarea");
      textArea.value = entry.result.reply;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopyStatus(copied ? "success" : "error");
    } catch (error) {
      console.error("Erro ao copiar resposta:", error);
      setCopyStatus("error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && entry && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={handleBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <motion.div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/15 bg-black/85 p-6 text-sm text-slate-200 shadow-[0_40px_80px_rgba(0,0,0,0.65)]"
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/30 hover:text-white focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60"
          aria-label="Fechar detalhes do histórico"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>

          {status && (
            <header className="flex items-start gap-3">
              <span className={`flex h-12 w-12 items-center justify-center rounded-full ${status.highlight}`}>
                <status.Icon className={`h-7 w-7 ${status.accent}`} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">{status.label}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-100">{entry.preview}</h2>
                <p className="text-xs text-slate-400">
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "medium",
                    timeStyle: "short"
                  }).format(new Date(entry.timestamp))}
                </p>
              </div>
            </header>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Origem</p>
              <p className="mt-2 text-sm font-semibold text-slate-100">{entry.inputLabel}</p>
              <p className="mt-1 text-xs text-slate-400">
                {entry.inputKind === "file" ? "Arquivo enviado" : "Texto digitado"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Confiabilidade</p>
              <p className="mt-2 text-sm font-semibold text-slate-100">
                {typeof entry.result.confidence === "number" && !Number.isNaN(entry.result.confidence)
                  ? `${Math.round(entry.result.confidence * 100)}%`
                  : "Não informado"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Conteúdo analisado</p>
            {entry.inputKind === "text" ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-200/90">
                {entry.inputContent && entry.inputContent.trim()
                  ? entry.inputContent
                  : "Sem conteúdo registrado."}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-300/80">
                O conteúdo do arquivo não é armazenado por questões de segurança.
              </p>
            )}
          </div>

          {entry.result.reason && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Justificativa da IA</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-200/90">{entry.result.reason}</p>
            </div>
          )}

          {entry.result.keywords && entry.result.keywords.length > 0 && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Palavras-chave</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.result.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-brand-400/40 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-100"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-brand-400/30 bg-brand-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.35em] text-brand-200/80">Resposta sugerida</p>
              <button
                type="button"
                onClick={handleCopyResponse}
                disabled={!entry.result.reply}
                className="inline-flex items-center gap-2 rounded-full border border-brand-400/60 bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-brand-200 transition hover:border-brand-300/80 hover:text-brand-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
              >
                <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
                Copiar resposta
              </button>
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-4 text-sm text-slate-100/90">
              {entry.result.reply ? (
                <p className="whitespace-pre-wrap leading-relaxed">{entry.result.reply}</p>
              ) : (
                <p className="text-slate-400">Nenhuma resposta sugerida foi gerada para esta análise.</p>
              )}
            </div>
            {copyStatus !== "idle" && (
              <p
                className={`mt-2 text-xs font-medium ${
                  copyStatus === "success" ? "text-brand-200" : "text-red-200"
                }`}
              >
                {copyStatus === "success" ? "Resposta copiada para a área de transferência." : "Não foi possível copiar a resposta."}
              </p>
            )}
          </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
