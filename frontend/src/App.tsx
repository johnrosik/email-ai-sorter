import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import gsap from "gsap";
import {
  analyzeGmailInbox,
  classifyEmail,
  disconnectGmailSession,
  getGmailAuthUrl,
  getGmailSessionStatus
} from "./api";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { ResultCard } from "./components/ResultCard";
import { HistoryPanel } from "./components/HistoryPanel";
import { HistoryDetailModal } from "./components/HistoryDetailModal";
import type {
  ClassificationHistoryEntry,
  ClassificationResponse,
  GmailAnalyzedMessage,
  GmailSessionStatus
} from "./types";

const SAMPLE_EMAILS = [
  "Olá equipe, preciso que confirmem a disponibilidade para a reunião de alinhamento amanhã às 9h. Incluam na resposta os pontos que gostariam de tratar.",
  "Bom dia, segue anexo o relatório de performance do mês. Preciso que revisem até quinta-feira e apontem melhorias prioritárias.",
  "Oi time financeiro, podem validar se a nota fiscal 2389 já foi conciliada? O fornecedor está cobrando um posicionamento ainda hoje.",
  "Olá suporte, cliente relatou instabilidade no painel desde às 14h. Podem investigar e me enviar um diagnóstico inicial?",
  "Boa tarde, estou preparando o material do workshop e preciso de três estudos de caso recentes sobre automação de e-mails.",
  "Pessoal, conseguimos antecipar a entrega da campanha? O marketing precisa aprovar os textos finais até sexta-feira."
];

const NAV_ITEMS = [
  { label: "Início", href: "#hero" },
  { label: "Sobre", href: "#about" }
];

const navVariants = {
  hidden: { y: -120, opacity: 0 },
  visible: { y: 0, opacity: 1 }
};

export default function App() {
  const [emailText, setEmailText] = useState("");
  const [result, setResult] = useState<ClassificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastSampleIndex, setLastSampleIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<ClassificationHistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [productionMode, setProductionMode] = useState<"manual" | "gmail">("manual");
  const [gmailStatus, setGmailStatus] = useState<GmailSessionStatus>({
    connected: false,
    email: null,
    messages_total: null
  });
  const [gmailQuery, setGmailQuery] = useState("in:inbox newer_than:7d");
  const [gmailMaxResults, setGmailMaxResults] = useState(1);
  const [gmailItems, setGmailItems] = useState<GmailAnalyzedMessage[]>([]);
  const [isGmailLoading, setIsGmailLoading] = useState(false);
  const heroTitleRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { scrollY } = useScroll();

  const charactersRemaining = useMemo(() => Math.max(0, 5000 - emailText.length), [emailText]);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const showErrorMessage = (message: string) => {
    setError(message);
    setResult(null);
    setActiveHistoryId(null);
    setIsHistoryModalOpen(false);
  };

  const sanitizeResponse = (data: ClassificationResponse): ClassificationResponse => ({
    ...data,
    error: null,
    keywords: data.keywords ? [...data.keywords] : null
  });

  const generateHistoryId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const buildHistoryEntry = (
    response: ClassificationResponse,
    trimmedText: string,
    file: File | null
  ): ClassificationHistoryEntry => {
    const inputKind = file ? "file" : "text";
    const inputLabel = file ? file.name : "Texto digitado";
    const basePreview = inputKind === "text" ? trimmedText || "Sem conteúdo" : file?.name ?? "Arquivo enviado";
    const preview = basePreview.length > 160 ? `${basePreview.slice(0, 160)}…` : basePreview;

    return {
      id: generateHistoryId(),
      timestamp: Date.now(),
      inputKind,
      inputLabel,
      preview,
      inputContent: inputKind === "text" ? trimmedText : null,
      result: {
        ...response,
        keywords: response.keywords ? [...response.keywords] : null
      }
    };
  };

  const appendHistoryEntry = (entry: ClassificationHistoryEntry) => {
    setHistory((previous) => [entry, ...previous].slice(0, 20));
    setActiveHistoryId(entry.id);
  };

  const extractServiceError = (response: ClassificationResponse) => {
    const fallbackMessage = response.error?.trim() || "Ocorreu um erro desconhecido.";
    const detailedMessage = typeof response.reason === "string" && response.reason.trim() ? response.reason : null;
    return detailedMessage ?? fallbackMessage;
  };

  const validateSelectedFile = (file: File): string | null => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedExtensions = new Set(["txt", "pdf"]);
    const maxFileSize = 16 * 1024 * 1024;

    if (!allowedExtensions.has(extension)) {
      return "Formato não suportado. Envie um arquivo .txt ou .pdf.";
    }

    if (file.size > maxFileSize) {
      return "O arquivo excede 16MB. Selecione um arquivo menor.";
    }

    return null;
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      const titleEl = heroTitleRef.current;
      if (!titleEl) {
        return;
      }

      gsap.fromTo(
        titleEl,
        { opacity: 0, y: 60, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.2, ease: "power3.out" }
      );

      gsap.to(titleEl, {
        textShadow: "0 0 34px rgba(84, 247, 173, 0.7)",
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    }, heroTitleRef);

    return () => ctx.revert();
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > previous && latest > 80) {
      setNavHidden(true);
    } else {
      setNavHidden(false);
    }
  });

  const refreshGmailStatus = useCallback(async () => {
    try {
      const status = await getGmailSessionStatus();
      setGmailStatus(status);
      if (!status.connected) {
        setGmailItems([]);
      }
    } catch {
      setGmailStatus({ connected: false, email: null, messages_total: null });
    }
  }, []);

  useEffect(() => {
    void refreshGmailStatus();
  }, [refreshGmailStatus]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string };
      if (data?.type === "gmail_connected") {
        void refreshGmailStatus();
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refreshGmailStatus]);

  const handleConnectGmail = useCallback(async () => {
    try {
      const authUrl = await getGmailAuthUrl();
      window.open(authUrl, "gmail-oauth-popup", "width=560,height=700");
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : "Falha ao conectar Gmail.";
      showErrorMessage(message);
    }
  }, []);

  const handleDisconnectGmail = useCallback(async () => {
    await disconnectGmailSession();
    setGmailStatus({ connected: false, email: null, messages_total: null });
    setGmailItems([]);
  }, []);

  const handleAnalyzeGmail = useCallback(async () => {
    if (!gmailStatus.connected) {
      showErrorMessage("Conecte sua conta Gmail antes de analisar.");
      return;
    }

    setIsGmailLoading(true);
    setError(null);
    setResult(null);
    setActiveHistoryId(null);
    setIsHistoryModalOpen(false);

    try {
      const response = await analyzeGmailInbox({
        maxResults: gmailMaxResults,
        query: gmailQuery
      });
      setGmailItems(response.items);
      if (response.items.length === 0) {
        setError("Nenhum email encontrado com esse filtro.");
      }
    } catch (analyzeError) {
      const message = analyzeError instanceof Error ? analyzeError.message : "Falha ao analisar inbox.";
      setError(message);
    } finally {
      setIsGmailLoading(false);
    }
  }, [gmailMaxResults, gmailQuery, gmailStatus.connected]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedText = emailText.trim();

    if (!selectedFile && !trimmedText) {
      showErrorMessage("Inclua um texto ou anexe um arquivo .txt ou .pdf para classificar.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setActiveHistoryId(null);
    setIsHistoryModalOpen(false);

    try {
      const data = await classifyEmail({ emailText: trimmedText, file: selectedFile });
      if (data.error) {
        showErrorMessage(extractServiceError(data));
        return;
      }

      const sanitizedResult = sanitizeResponse(data);
      setResult(sanitizedResult);
      setError(null);

      const entry = buildHistoryEntry(sanitizedResult, trimmedText, selectedFile);
      appendHistoryEntry(entry);
    } catch (classificationError) {
      const message = classificationError instanceof Error ? classificationError.message : String(classificationError);
      showErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseSample = () => {
    if (SAMPLE_EMAILS.length === 0) {
      return;
    }

    let nextIndex = Math.floor(Math.random() * SAMPLE_EMAILS.length);
    if (lastSampleIndex !== null && SAMPLE_EMAILS.length > 1) {
      while (nextIndex === lastSampleIndex) {
        nextIndex = Math.floor(Math.random() * SAMPLE_EMAILS.length);
      }
    }

    const nextSample = SAMPLE_EMAILS[nextIndex];

    setLastSampleIndex(nextIndex);
    setEmailText(nextSample);
    setSelectedFile(null);
    resetFileInput();
    setResult(null);
    setError(null);
    setActiveHistoryId(null);
    setIsHistoryModalOpen(false);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validationError = validateSelectedFile(file);
    if (validationError) {
      setSelectedFile(null);
      setError(validationError);
      event.target.value = "";
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    resetFileInput();
  };

  const handleStart = () => {
    const section = document.getElementById("production");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSelectHistory = useCallback(
    (entry: ClassificationHistoryEntry) => {
      setResult(entry.result);
      setError(null);
      setActiveHistoryId(entry.id);
      setIsLoading(false);

      if (entry.inputKind === "text") {
        setEmailText(entry.inputContent ?? "");
      } else {
        setEmailText("");
      }

      setSelectedFile(null);
      resetFileInput();
    },
    []
  );

  const activeHistoryEntry = useMemo(
    () => history.find((entry) => entry.id === activeHistoryId) ?? null,
    [history, activeHistoryId]
  );

  const handleHistoryDetailOpen = useCallback(() => setIsHistoryModalOpen(true), []);
  const handleHistoryDetailClose = useCallback(() => setIsHistoryModalOpen(false), []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#03130d] text-slate-100">
      <AnimatedBackground />

      <motion.nav
        className="fixed inset-x-0 top-0 z-40 px-6 pt-6"
        variants={navVariants}
        initial="hidden"
        animate={navHidden ? "hidden" : "visible"}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full bg-[#0a3a27]/90 px-6 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <span className="brand-font text-xs uppercase tracking-[0.32em] text-brand-100/90">imu classifier</span>
            <span className="text-sm font-semibold text-slate-200">
              Imu <span className="bg-gradient-to-r from-brand-300 to-brand-100 bg-clip-text text-transparent">Email Classifier</span>
            </span>
          </div>

          <ul className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
            {NAV_ITEMS.map((item) => (
              <motion.li key={item.href} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}>
                <a
                  href={item.href}
                  className="rounded-full px-4 py-2 text-slate-200 transition hover:bg-brand-500/30 hover:text-brand-50 focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60"
                >
                  {item.label}
                </a>
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.nav>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-32 px-6 pb-24 pt-32">
        <section id="hero" className="relative flex min-h-[70vh] flex-col items-center justify-center text-center">
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <motion.span
              className="inline-flex rounded-full bg-brand-500/25 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-brand-100 shadow-[0_6px_20px_rgba(0,0,0,0.2)]"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            >
              Imu Email Classifier
            </motion.span>

            <motion.h1 className="brand-font font-bold leading-tight">
              <span
                ref={heroTitleRef}
                className="imu-display block text-[clamp(3.4rem,11vw,8rem)] font-extrabold drop-shadow-[0_0_45px_rgba(84,247,173,0.55)]"
              >
                Imu Email Classifier
              </span>
              <span className="mt-5 block text-[clamp(1.4rem,3.6vw,2.3rem)] font-semibold text-brand-100">
                Confiança para priorizar cada email com IA
              </span>
              <span className="mt-6 block text-lg font-medium text-slate-200/90 sm:text-xl">
                Imu transforma sua caixa de entrada em decisões claras e acionáveis.
              </span>
            </motion.h1>

            <motion.p
              className="mx-auto max-w-2xl text-base text-slate-200/80"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
            >
              Classifique produtividade, entenda o contexto com transparência e acelere respostas sem perder o toque humano.
            </motion.p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <motion.button
                type="button"
                onClick={handleStart}
                className="group inline-flex items-center gap-3 rounded-full bg-brand-500 px-7 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-[#032112] shadow-[0_20px_60px_rgba(24,187,112,0.35)] transition hover:bg-brand-400 focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
              >
                Começar
                <span className="text-base">→</span>
              </motion.button>
              <motion.a
                href="#about"
                className="inline-flex items-center rounded-full bg-[#0b3b28] px-7 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-brand-100 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition hover:bg-[#104a33] hover:text-brand-50 focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
              >
                Sobre
              </motion.a>
            </div>
          </motion.div>
        </section>

        <section id="about" className="relative rounded-3xl bg-[#0a3725]/88 p-10 shadow-[0_28px_70px_rgba(0,0,0,0.32)] backdrop-blur-md">
          <motion.div
            className="grid gap-8 md:grid-cols-2"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={{
              hidden: { opacity: 0, y: 40 },
              visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.15, duration: 0.6, ease: "easeOut" } }
            }}
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }}>
              <h2 className="brand-font text-3xl font-semibold text-brand-100">Imu Email Classifier</h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-100/90">
                O Imu nasceu para resolver um problema simples: caixa de entrada cheia e pouca clareza sobre o que merece atenção agora.
                Em vez de só marcar emails como bons ou ruins, ele te entrega contexto para decidir rápido, com segurança.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-100/85">
                A ideia é ajudar sua rotina real: priorizar o que move trabalho, reduzir distrações e manter um padrão de resposta profissional,
                mesmo nos dias mais corridos.
              </p>
            </motion.div>
            <motion.ul
              className="space-y-4 text-sm text-slate-100/95"
              variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }}
            >
              <li className="rounded-2xl bg-[#0d422d] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                <span className="text-brand-300">•</span> Classificação prática para separar urgência real de ruído.
              </li>
              <li className="rounded-2xl bg-[#0d422d] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                <span className="text-brand-300">•</span> Nível de confiança para você decidir sem depender de "achismo".
              </li>
              <li className="rounded-2xl bg-[#0d422d] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                <span className="text-brand-300">•</span> Sugestão de resposta pronta para agilizar o atendimento diário.
              </li>
            </motion.ul>
          </motion.div>
        </section>

        <section
          id="production"
          className="relative overflow-hidden rounded-3xl bg-[#082f20]/90 shadow-[0_45px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_160%_at_top,rgba(24,187,112,0.13),transparent_65%),_linear-gradient(180deg,rgba(6,35,23,0.94),rgba(2,17,11,0.98))]" />

          <div className="relative z-10 p-10">
            <motion.header
              className="mb-8 space-y-3 text-center"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <p className="inline-flex rounded-full bg-brand-500/25 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-brand-100 shadow-[0_5px_14px_rgba(0,0,0,0.22)]">
                Área de produção
              </p>
              <h2 className="brand-font text-3xl font-semibold text-brand-50 sm:text-4xl">Classifique seu email agora</h2>
              <p className="mx-auto max-w-2xl text-sm text-slate-200/80">
                Cole o conteúdo do email e receba a avaliação de produtividade, nível de confiança do modelo e sugestão de
                resposta para manter o fluxo profissional.
              </p>
            </motion.header>

            <div className="mb-8 rounded-3xl bg-[#0d422d] p-4 text-sm text-brand-100/90 shadow-[0_12px_30px_rgba(0,0,0,0.2)]">
              <p className="text-xs uppercase tracking-[0.35em] text-brand-100/85">Aviso</p>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-slate-200/90">
                A primeira resposta pode levar cerca de 50 segundos, pois a versão gratuita do Render reativa o backend sob
                demanda após períodos de inatividade.
              </p>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setProductionMode("manual")}
                className={`rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition ${
                  productionMode === "manual"
                    ? "bg-brand-500 text-[#032112]"
                    : "bg-[#165339] text-brand-100 hover:bg-[#1d6b48]"
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setProductionMode("gmail")}
                className={`rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition ${
                  productionMode === "gmail"
                    ? "bg-brand-500 text-[#032112]"
                    : "bg-[#165339] text-brand-100 hover:bg-[#1d6b48]"
                }`}
              >
                Gmail Inbox
              </button>
            </div>

            {productionMode === "manual" ? (
              <>
                <motion.form
                  onSubmit={handleSubmit}
                  className="space-y-6"
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ delay: 0.1, duration: 0.6, ease: "easeOut" }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <label htmlFor="email-text" className="text-xs uppercase tracking-[0.35em] text-slate-300/80">
                      Conteúdo do email
                    </label>
                    <span className="text-xs uppercase tracking-[0.35em] text-slate-400/80">
                      {charactersRemaining} caracteres restantes
                    </span>
                  </div>
                  <textarea
                    id="email-text"
                    name="email-text"
                    value={emailText}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEmailText(event.target.value)}
                    placeholder="Cole ou digite a mensagem aqui..."
                    className="h-64 w-full resize-y rounded-3xl bg-[#0d422d] p-6 text-base text-slate-100 shadow-inner shadow-black/35 outline-none transition focus:ring-2 focus:ring-brand-500/40"
                    maxLength={5000}
                  />

                  <div className="rounded-3xl bg-[#0d422d] p-5 shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-300/80">Upload de arquivo (opcional)</p>
                    <p className="mt-2 text-xs text-slate-400/90">
                      Formatos aceitos: <span className="text-slate-200">.txt</span> e <span className="text-slate-200">.pdf</span>
                      (até 16MB)
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center rounded-full bg-brand-500/28 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-brand-100 transition hover:bg-brand-500/42 focus:outline-none focus-visible:ring focus-visible:ring-brand-300/50"
                      >
                        Selecionar arquivo
                      </button>
                      <input ref={fileInputRef} type="file" accept=".txt,.pdf" onChange={handleFileChange} className="sr-only" />
                      <span className={`text-xs ${selectedFile ? "text-slate-100" : "text-slate-400"}`}>
                        {selectedFile ? selectedFile.name : "Nenhum arquivo selecionado"}
                      </span>
                      {selectedFile && (
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="inline-flex items-center justify-center rounded-full bg-[#1a5f43] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-brand-100 transition hover:bg-[#227752] hover:text-brand-50 focus:outline-none focus-visible:ring focus-visible:ring-brand-300/50"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={handleUseSample}
                      className="inline-flex items-center justify-center rounded-full bg-[#165339] px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-brand-100 shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:bg-[#1d6b48] hover:text-brand-50 focus:outline-none focus-visible:ring focus-visible:ring-brand-300/50"
                    >
                      Usar exemplo aleatório
                    </button>

                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-full bg-brand-500 px-8 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-[#032112] shadow-[0_25px_65px_rgba(24,187,112,0.45)] transition hover:bg-brand-400 focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60 disabled:cursor-not-allowed disabled:bg-brand-500/40"
                      disabled={isLoading}
                    >
                      {isLoading ? "Analisando..." : "Classificar"}
                    </button>
                  </div>
                </motion.form>

                <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <ResultCard result={result} isLoading={isLoading} error={error} />
                  <HistoryPanel
                    history={history}
                    activeId={activeHistoryId}
                    onSelect={handleSelectHistory}
                    onOpenDetail={handleHistoryDetailOpen}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-6 rounded-3xl bg-[#0d422d] p-6 shadow-[0_20px_55px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-200/70">Conexão Gmail</p>
                    <p className="text-sm text-slate-100">
                      {gmailStatus.connected ? `Conectado: ${gmailStatus.email ?? "Conta ativa"}` : "Não conectado"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!gmailStatus.connected ? (
                      <button
                        type="button"
                        onClick={handleConnectGmail}
                        className="rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#032112]"
                      >
                        Conectar Gmail
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleDisconnectGmail}
                        className="rounded-full bg-[#165339] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-100"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_160px_auto]">
                  <input
                    type="text"
                    value={gmailQuery}
                    onChange={(event) => setGmailQuery(event.target.value)}
                    placeholder="Ex.: in:inbox newer_than:7d"
                    className="rounded-2xl bg-[#11472f] px-4 py-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                  <select
                    value={gmailMaxResults}
                    onChange={(event) => setGmailMaxResults(Number(event.target.value))}
                    className="rounded-2xl bg-[#11472f] px-4 py-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    <option value={1}>1 email</option>
                    <option value={3}>3 emails</option>
                    <option value={5}>5 emails</option>
                    <option value={10}>10 emails</option>
                    <option value={20}>20 emails</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAnalyzeGmail}
                    disabled={!gmailStatus.connected || isGmailLoading}
                    className="rounded-2xl bg-brand-500 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#032112] disabled:cursor-not-allowed disabled:bg-brand-500/40"
                  >
                    {isGmailLoading ? "Analisando..." : "Analisar Inbox"}
                  </button>
                </div>

                {error && <p className="text-sm text-red-200">{error}</p>}

                <div className="space-y-3">
                  {gmailItems.length === 0 && (
                    <p className="text-sm text-slate-200/80">
                      Conecte o Gmail e execute a análise. Os resultados aparecem somente nesta sessão.
                    </p>
                  )}
                  {gmailItems.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-[#11472f] p-4">
                      <p className="text-sm font-semibold text-slate-100">{item.subject || "(Sem assunto)"}</p>
                      <p className="mt-1 text-xs text-slate-200/75">{item.from}</p>
                      <p className="mt-1 text-xs text-slate-200/65">{item.date || "Data não informada"}</p>
                      <p className="mt-2 text-xs text-slate-200/70">{item.snippet}</p>
                      {item.body_text && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-brand-100/90">
                            Ver conteúdo do e-mail
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#0b3b28] p-3 text-xs leading-relaxed text-slate-100/90">
                            {item.body_text}
                          </p>
                        </details>
                      )}
                      <p className="mt-2 text-xs text-brand-100/90">
                        Classificação: {item.classification.productive === null ? "Inconclusivo" : item.classification.productive ? "Produtivo" : "Não produtivo"}
                        {typeof item.classification.confidence === "number" ? ` (${(item.classification.confidence * 100).toFixed(0)}%)` : ""}
                      </p>
                      {item.classification.reason && (
                        <p className="mt-2 text-xs text-slate-100/85">
                          Motivo: {item.classification.reason}
                        </p>
                      )}
                      {item.classification.keywords && item.classification.keywords.length > 0 && (
                        <p className="mt-2 text-xs text-slate-100/80">
                          Palavras-chave: {item.classification.keywords.join(", ")}
                        </p>
                      )}
                      {item.classification.reply && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-brand-100/90">
                            Ver resposta sugerida
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#0b3b28] p-3 text-xs leading-relaxed text-slate-100/90">
                            {item.classification.reply}
                          </p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <HistoryDetailModal entry={activeHistoryEntry} isOpen={isHistoryModalOpen} onClose={handleHistoryDetailClose} />
    </div>
  );
}
