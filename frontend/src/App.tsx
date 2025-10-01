import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import gsap from "gsap";
import { classifyEmail } from "./api";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { ResultCard } from "./components/ResultCard";
import { HistoryPanel } from "./components/HistoryPanel";
import { HistoryDetailModal } from "./components/HistoryDetailModal";
import type { ClassificationHistoryEntry, ClassificationResponse } from "./types";

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
        textShadow: "0 0 32px rgba(255, 215, 0, 0.85)",
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
    <div className="relative min-h-screen overflow-x-hidden bg-black text-slate-100">
      <AnimatedBackground />

      <motion.nav
        className="fixed inset-x-0 top-0 z-40 px-6 pt-6"
        variants={navVariants}
        initial="hidden"
        animate={navHidden ? "hidden" : "visible"}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/10 bg-black/60 px-6 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-[0.4em] text-brand-200">Rosiak</span>
            <span className="text-sm font-semibold text-slate-300">Email IA Classifier 1.0</span>
          </div>

          <ul className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
            {NAV_ITEMS.map((item) => (
              <motion.li key={item.href} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}>
                <a
                  href={item.href}
                  className="rounded-full px-4 py-2 text-slate-200 transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60"
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
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-brand-200"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            >
              Email IA Classifier 1.0
            </motion.span>

            <motion.h1 className="font-black leading-tight">
              <span
                ref={heroTitleRef}
                className="block text-[clamp(3rem,8vw,6rem)] uppercase tracking-[0.45em] text-brand-300 drop-shadow-[0_0_45px_rgba(255,215,0,0.55)]"
              >
                Rosiak
              </span>
              <span className="mt-6 block text-lg font-light text-slate-300 sm:text-xl">
                A central de produtividade que impulsiona suas decisões com IA em tempo real.
              </span>
            </motion.h1>

            <motion.p
              className="mx-auto max-w-2xl text-base text-slate-300/80"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
            >
              Descubra em segundos se um email é produtivo, o grau de confiabilidade do julgamento da IA e receba uma resposta sugerida
              pronta para agir com profissionalismo.
            </motion.p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <motion.button
                type="button"
                onClick={handleStart}
                className="group inline-flex items-center gap-3 rounded-full bg-brand-500 px-7 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-black shadow-[0_20px_60px_rgba(212,136,7,0.35)] transition hover:bg-brand-400 focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
              >
                Start
                <span className="text-base">→</span>
              </motion.button>
              <motion.a
                href="#about"
                className="inline-flex items-center rounded-full border border-white/10 bg-transparent px-7 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-slate-200 transition hover:border-brand-300 hover:text-brand-300 focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
              >
                Sobre
              </motion.a>
            </div>
          </motion.div>
        </section>

        <section id="about" className="relative rounded-3xl border border-white/5 bg-white/5 p-10 backdrop-blur-xl">
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
              <h2 className="text-3xl font-semibold text-white">Por que Roisak?</h2>
              <p className="mt-4 text-sm text-slate-300/80">
                Em um mundo cada vez mais tecnológico e acelerado, a Roisak coloca a inteligência artificial no centro da sua
                produtividade. A plataforma interpreta sinais, prioriza tarefas e transforma caixas de entrada caóticas em
                decisões rápidas. Com automação elegante e insights imediatos, o seu time ganha foco, reduz ruídos e entrega
                resultados com eficiência profundamente moderna.
              </p>
            </motion.div>
            <motion.ul
              className="space-y-4 text-sm text-slate-200/90"
              variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }}
            >
              <li className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_20px_45px_rgba(0,0,0,0.45)]">
                <span className="text-brand-200">•</span> Insights instantâneos sobre produtividade de cada email.
              </li>
              <li className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_20px_45px_rgba(0,0,0,0.45)]">
                <span className="text-brand-200">•</span> Confiabilidade detalhada para tomar decisões com segurança.
              </li>
              <li className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_20px_45px_rgba(0,0,0,0.45)]">
                <span className="text-brand-200">•</span> Sugestão de resposta pronta para enviar ou adaptar ao seu tom.
              </li>
            </motion.ul>
          </motion.div>
        </section>

        <section
          id="production"
          className="relative overflow-hidden rounded-3xl shadow-[0_45px_120px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_160%_at_top,rgba(240,178,29,0.08),transparent_65%),_linear-gradient(180deg,rgba(8,8,8,0.96),rgba(2,2,2,0.99))]" />

          <div className="relative z-10 p-10">
            <motion.header
              className="mb-8 space-y-3 text-center"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
            <p className="inline-flex rounded-full border border-brand-400/50 bg-brand-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-brand-200">
              Área de produção
            </p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Classifique seu email agora</h2>
            <p className="mx-auto max-w-2xl text-sm text-slate-300/80">
              Cole o conteúdo do email e receba imediatamente a avaliação de produtividade, o grau de confiança do modelo e uma
              resposta sugerida para manter o fluxo profissional.
            </p>
          </motion.header>

          <div className="mb-8 rounded-3xl border border-brand-400/20 bg-brand-500/10 p-4 text-sm text-brand-100/90">
            <p className="text-xs uppercase tracking-[0.35em] text-brand-200/80">Aviso</p>
            <p className="mt-2 text-[0.85rem] leading-relaxed text-slate-300/90">
              A primeira resposta pode levar cerca de 50 segundos: pois esta é uma limitação da versão gratuita do Render e o servidor web é reativado
              sob demanda quando fica em espera.
            </p>
          </div>

            <motion.form
            onSubmit={handleSubmit}
            className="space-y-6"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: 0.1, duration: 0.6, ease: "easeOut" }}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <label htmlFor="email-text" className="text-xs uppercase tracking-[0.35em] text-slate-400">
                Conteúdo do email
              </label>
              <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
                {charactersRemaining} caracteres restantes
              </span>
            </div>
            <textarea
              id="email-text"
              name="email-text"
              value={emailText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEmailText(event.target.value)}
              placeholder="Cole ou digite a mensagem aqui..."
              className="h-64 w-full resize-y rounded-3xl border border-white/10 bg-white/5 p-6 text-base text-slate-100 shadow-inner shadow-black/60 outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-500/40"
              maxLength={5000}
            />

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Upload de arquivo (opcional)</p>
              <p className="mt-2 text-xs text-slate-500">
                Formatos aceitos: <span className="text-slate-300">.txt</span> e <span className="text-slate-300">.pdf</span> (até 16MB)
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-full bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:bg-white/20 focus:outline-none focus-visible:ring focus-visible:ring-brand-300/50"
                >
                  Selecionar arquivo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <span className={`text-xs ${selectedFile ? "text-slate-200" : "text-slate-500"}`}>
                  {selectedFile ? selectedFile.name : "Nenhum arquivo selecionado"}
                </span>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:border-brand-300 hover:text-brand-200 focus:outline-none focus-visible:ring focus-visible:ring-brand-300/50"
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
                className="inline-flex items-center justify-center rounded-full border border-brand-400/50 bg-transparent px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-brand-200 transition hover:border-brand-300 hover:text-brand-100 focus:outline-none focus-visible:ring focus-visible:ring-brand-300/50"
              >
                Usar exemplo aleatório
              </button>

              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-brand-500 px-8 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-black shadow-[0_25px_65px_rgba(212,136,7,0.45)] transition hover:bg-brand-400 focus:outline-none focus-visible:ring focus-visible:ring-brand-400/60 disabled:cursor-not-allowed disabled:bg-brand-500/40"
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
          </div>
        </section>
      </main>
      <HistoryDetailModal entry={activeHistoryEntry} isOpen={isHistoryModalOpen} onClose={handleHistoryDetailClose} />
    </div>
  );
}
