'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Mode = 'raw' | 'sentinel' | 'improve';
type Phase = 'Planner' | 'Builder' | 'Evaluator' | 'Self-Healer';
type ActivePhase = Phase | 'Completed' | null;

type RiskBreakdown = {
  validation: string;
  authentication: string;
  secretHandling: string;
  errorHandling: string;
};

type Confidence = {
  planningConfidence: string;
  implementationConfidence: string;
  securityConfidence: string;
};

type Evaluation = {
  reliabilityScore: number;
  securityScore: number;
  hallucinationRisk: 'low' | 'medium' | 'high';
  riskBreakdown: RiskBreakdown;
  confidence: Confidence;
  issues: string[];
};

type AgentResult = {
  baselineCode: string;
  finalCode?: string;
  evaluation: Evaluation;
  improvementSummary?: string;
};

type StreamEvent =
  | { type: 'log'; message: string }
  | { type: 'complete'; payload: AgentResult }
  | { type: 'error'; message: string };

type LogEntry = {
  id: number;
  message: string;
  timestamp: string;
};

const PHASES: Phase[] = ['Planner', 'Builder', 'Evaluator', 'Self-Healer'];

const RISK_LABELS: Array<{ key: keyof RiskBreakdown; label: string }> = [
  { key: 'validation', label: 'Validation' },
  { key: 'authentication', label: 'Authentication' },
  { key: 'secretHandling', label: 'Secret Handling' },
  { key: 'errorHandling', label: 'Error Handling' },
];

function formatTime() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function getPhaseFromLog(message: string): Phase | null {
  if (message.includes('[Planner]')) return 'Planner';
  if (message.includes('[Builder]')) return 'Builder';
  if (message.includes('[Evaluator]')) return 'Evaluator';
  if (message.includes('[Self-Healer]')) return 'Self-Healer';

  return null;
}

function isPhaseCompletionMessage(phase: Phase, message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  if (phase === 'Planner') {
    return normalizedMessage.includes('architecture generated');
  }

  if (phase === 'Builder') {
    return normalizedMessage.includes('implementation generated');
  }

  if (phase === 'Evaluator') {
    return normalizedMessage.includes('audit completed');
  }

  return normalizedMessage.includes('refactoring completed');
}

function isRiskBreakdown(value: unknown): value is RiskBreakdown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const risk = value as Record<string, unknown>;

  return (
    typeof risk.validation === 'string' &&
    typeof risk.authentication === 'string' &&
    typeof risk.secretHandling === 'string' &&
    typeof risk.errorHandling === 'string'
  );
}

function isConfidence(value: unknown): value is Confidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const confidence = value as Record<string, unknown>;

  return (
    typeof confidence.planningConfidence === 'string' &&
    typeof confidence.implementationConfidence === 'string' &&
    typeof confidence.securityConfidence === 'string'
  );
}

function isEvaluation(value: unknown): value is Evaluation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const evaluation = value as Record<string, unknown>;

  return (
    typeof evaluation.reliabilityScore === 'number' &&
    typeof evaluation.securityScore === 'number' &&
    (evaluation.hallucinationRisk === 'low' ||
      evaluation.hallucinationRisk === 'medium' ||
      evaluation.hallucinationRisk === 'high') &&
    isRiskBreakdown(evaluation.riskBreakdown) &&
    isConfidence(evaluation.confidence) &&
    Array.isArray(evaluation.issues) &&
    evaluation.issues.every((issue) => typeof issue === 'string')
  );
}

function isAgentResult(value: unknown): value is AgentResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const result = value as Record<string, unknown>;

  return (
    typeof result.baselineCode === 'string' &&
    isEvaluation(result.evaluation) &&
    (result.finalCode === undefined || typeof result.finalCode === 'string') &&
    (result.improvementSummary === undefined ||
      typeof result.improvementSummary === 'string')
  );
}

function parseStreamEvent(line: string): StreamEvent {
  const parsed: unknown = JSON.parse(line);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Received an invalid stream event.');
  }

  const event = parsed as Record<string, unknown>;

  if (event.type === 'log' && typeof event.message === 'string') {
    return { type: 'log', message: event.message };
  }

  if (event.type === 'error' && typeof event.message === 'string') {
    return { type: 'error', message: event.message };
  }

  if (event.type === 'complete' && isAgentResult(event.payload)) {
    return { type: 'complete', payload: event.payload };
  }

  throw new Error('Received an invalid stream event.');
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'generate' | 'improve'>('generate');
  const [prompt, setPrompt] = useState('');
  const [pastedCode, setPastedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [initialScore, setInitialScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [animatedFinal, setAnimatedFinal] = useState(0);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activePhase, setActivePhase] = useState<ActivePhase>(null);
  const [completedPhases, setCompletedPhases] = useState<Phase[]>([]);
  const [modeLabel, setModeLabel] = useState<string | null>(null);

  const [riskBreakdown, setRiskBreakdown] = useState<RiskBreakdown | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [baselineCode, setBaselineCode] = useState<string | null>(null);
  const [finalCode, setFinalCode] = useState<string | null>(null);
  const [improvementSummary, setImprovementSummary] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<'baseline' | 'final' | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const activePhaseRef = useRef<ActivePhase>(null);
  const logIdRef = useRef(0);
  const runIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    if (!hasRun || finalScore <= 0) {
      return;
    }

    const duration = 1000;
    const startTime = performance.now();
    let animationFrameId = 0;

    const animateScore = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      setAnimatedFinal(Math.floor(finalScore * progress));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animateScore);
      }
    };

    animationFrameId = requestAnimationFrame(animateScore);

    return () => cancelAnimationFrame(animationFrameId);
  }, [finalScore, hasRun]);

  useEffect(() => {
    runIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setLoading(false);
    setHasRun(false);
    setBaselineCode(null);
    setFinalCode(null);
    setImprovementSummary(null);
    setRiskBreakdown(null);
    setConfidence(null);
    setLogs([]);
    setInitialScore(0);
    setFinalScore(0);
    setAnimatedFinal(0);
    setActivePhase(null);
    setCompletedPhases([]);
    setModeLabel(null);
    setCopiedCode(null);

    activePhaseRef.current = null;
    logIdRef.current = 0;
    shouldAutoScrollRef.current = true;
  }, [activeTab]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const delta = finalScore - initialScore;
  const animationComplete = hasRun && animatedFinal === finalScore;
  const isImproved = hasRun && delta > 0;
  const phaseProgress = (completedPhases.length / PHASES.length) * 100;

  const status = useMemo(() => {
    if (!hasRun) {
      return {
        label: 'Awaiting Benchmark',
        dotClass: 'bg-zinc-500',
        textClass: 'text-zinc-300',
        borderClass: 'border-zinc-700',
        bgClass: 'bg-zinc-900/70',
      };
    }

    if (finalScore >= 90) {
      return {
        label: 'Production Ready',
        dotClass: 'bg-emerald-400',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-400/30',
        bgClass: 'bg-emerald-400/10',
      };
    }

    if (finalScore >= 75) {
      return {
        label: 'Stable with Minor Risks',
        dotClass: 'bg-amber-400',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-400/30',
        bgClass: 'bg-amber-400/10',
      };
    }

    return {
      label: 'Prototype Quality',
      dotClass: 'bg-rose-400',
      textClass: 'text-rose-300',
      borderClass: 'border-rose-400/30',
      bgClass: 'bg-rose-400/10',
    };
  }, [finalScore, hasRun]);

  function markPhaseCompleted(phase: Phase) {
    setCompletedPhases((currentPhases) =>
      currentPhases.includes(phase)
        ? currentPhases
        : [...currentPhases, phase],
    );
  }

  function updatePhaseFromLog(message: string) {
    const phase = getPhaseFromLog(message);

    if (!phase) {
      return;
    }

    const previousPhase = activePhaseRef.current;

    if (
      previousPhase &&
      previousPhase !== 'Completed' &&
      previousPhase !== phase
    ) {
      markPhaseCompleted(previousPhase);
    }

    activePhaseRef.current = phase;
    setActivePhase(phase);

    if (isPhaseCompletionMessage(phase, message)) {
      markPhaseCompleted(phase);
    }
  }

  function appendLog(message: string) {
    const logContainer = logRef.current;
    const isNearBottom =
      !logContainer ||
      logContainer.scrollHeight -
        logContainer.scrollTop -
        logContainer.clientHeight <
        50;

    shouldAutoScrollRef.current = isNearBottom;
    updatePhaseFromLog(message);

    setLogs((currentLogs) => [
      ...currentLogs,
      {
        id: logIdRef.current++,
        message,
        timestamp: formatTime(),
      },
    ]);

    // Scroll only when the user was already reading the newest activity.
    if (isNearBottom) {
      requestAnimationFrame(() => {
        const currentContainer = logRef.current;

        if (currentContainer && shouldAutoScrollRef.current) {
          currentContainer.scrollTop = currentContainer.scrollHeight;
        }
      });
    }
  }

  function resetRunState() {
    setHasRun(false);
    setAnimatedFinal(0);
    setInitialScore(0);
    setFinalScore(0);
    setRiskBreakdown(null);
    setConfidence(null);
    setBaselineCode(null);
    setFinalCode(null);
    setImprovementSummary(null);
    setCopiedCode(null);
    setLogs([]);
    setActivePhase(null);
    setCompletedPhases([]);

    activePhaseRef.current = null;
    logIdRef.current = 0;
    shouldAutoScrollRef.current = true;
  }

  function applyResult(result: AgentResult) {
    const score = result.evaluation.reliabilityScore;

    // The streaming execution result exposes one final evaluation. Using it for
    // both dashboard values avoids fabricating an unavailable baseline score.
    setInitialScore(score);
    setFinalScore(score);
    setRiskBreakdown(result.evaluation.riskBreakdown);
    setConfidence(result.evaluation.confidence);
    setBaselineCode(result.baselineCode);
    setFinalCode(result.finalCode ?? null);
    setImprovementSummary(result.improvementSummary ?? null);
    setHasRun(true);
    setLoading(false);

    activePhaseRef.current = 'Completed';
    setActivePhase('Completed');
  }

  async function copyCode(code: string, type: 'baseline' | 'final') {
    if (!code) {
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedCode(type);
    } catch {
      setCopiedCode(null);
    }
  }

  async function runBenchmark(mode: Mode) {
    const promptInput = prompt.trim();
    const codeInput = pastedCode.trim();
    const isImproveMode = mode === 'improve';

    if (
      loading ||
      (!isImproveMode && !promptInput) ||
      (isImproveMode && !codeInput)
    ) {
      return;
    }

    const runId = ++runIdRef.current;
    const abortController = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = abortController;

    resetRunState();
    setLoading(true);

    if (mode === 'raw') {
      setModeLabel('Raw AI Mode');
    } else if (mode === 'sentinel') {
      setModeLabel('Sentinel Mode');
    } else {
      setModeLabel('Improve Existing Code');
    }

    try {
      const requestBody =
        mode === 'improve'
          ? { mode, code: codeInput }
          : { mode, prompt: promptInput };

      const response = await fetch('/api/run-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.body) {
        throw new Error('Streaming is unavailable for this request.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedTerminalEvent = false;

      const processLine = (line: string): boolean => {
        if (!line.trim() || runId !== runIdRef.current) {
          return runId !== runIdRef.current;
        }

        const event = parseStreamEvent(line);

        if (event.type === 'log') {
          appendLog(event.message);
          return false;
        }

        if (event.type === 'complete') {
          applyResult(event.payload);
          receivedTerminalEvent = true;
          return true;
        }

        appendLog(`[System] ${event.message}`);
        setActivePhase(null);
        activePhaseRef.current = null;
        setLoading(false);
        receivedTerminalEvent = true;

        return true;
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const shouldStop = processLine(line);

          if (shouldStop) {
            await reader.cancel();
            break;
          }
        }

        if (receivedTerminalEvent || runId !== runIdRef.current) {
          break;
        }
      }

      buffer += decoder.decode();

      if (!receivedTerminalEvent && buffer.trim() && runId === runIdRef.current) {
        processLine(buffer);
      }

      if (
        !receivedTerminalEvent &&
        !response.ok &&
        runId === runIdRef.current
      ) {
        throw new Error(`Request failed with status ${response.status}.`);
      }
    } catch (error) {
      const wasCancelled =
        error instanceof DOMException && error.name === 'AbortError';

      if (!wasCancelled && runId === runIdRef.current) {
        appendLog(
          error instanceof Error
            ? `[System] ${error.message}`
            : '[System] Benchmark run failed. Please try again.',
        );
        setActivePhase(null);
        activePhaseRef.current = null;
      }
    } finally {
      if (runId === runIdRef.current) {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="pb-8 pt-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Sentinel Studio
          </h1>
          <p className="mt-2 text-sm text-zinc-400 sm:text-base">
            Multi-Agent AI Code Reliability & Self-Healing System
          </p>
          {modeLabel && (
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-cyan-400">
              {modeLabel}
            </p>
          )}
          <div className="mx-auto mt-5 h-px w-56 bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
        </header>

        <section className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
          <aside className="lg:col-span-3 xl:col-span-2">
            <div className="flex h-full min-h-[520px] flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/45 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                  Agent Activity
                </h2>
                <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-400">
                  Streaming
                </span>
              </div>

              <div className="mb-3 rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all duration-300 ${
                      activePhase === 'Completed'
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : activePhase
                          ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    {activePhase === 'Completed' ? (
                      <>✅ Completed</>
                    ) : activePhase ? (
                      <>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                        Active: {activePhase}
                      </>
                    ) : (
                      'Awaiting activity'
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {completedPhases.length}/{PHASES.length} phases
                  </span>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-[width] duration-500 ease-out"
                    style={{ width: `${phaseProgress}%` }}
                  />
                </div>
              </div>

              <div
                ref={logRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  shouldAutoScrollRef.current =
                    element.scrollHeight -
                      element.scrollTop -
                      element.clientHeight <
                    50;
                }}
                className="h-full min-h-[420px] flex-1 overflow-y-auto rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-3 text-xs leading-6"
              >
                {logs.length === 0 ? (
                  <div className="text-zinc-500">
                    [No active logs yet. Run a benchmark.]
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div
                      key={log.id}
                      className="agent-log-entry mb-1 text-zinc-300"
                    >
                      <span className="text-zinc-500">[{log.timestamp}]</span>{' '}
                      {log.message}
                      {loading && index === logs.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="agent-log-cursor ml-1 inline-block h-3 w-px bg-cyan-300 align-middle"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className="space-y-5 lg:col-span-5 xl:col-span-6">
            <div className="relative flex min-h-[520px] flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/55 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
              <div className="pointer-events-none absolute inset-x-14 top-0 h-20 bg-gradient-to-b from-cyan-400/10 to-transparent blur-2xl" />

              <div className="relative z-10 mb-4 flex gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('generate')}
                  disabled={loading}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'generate'
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Generate Code
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('improve')}
                  disabled={loading}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'improve'
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Improve Code
                </button>
              </div>

              {activeTab === 'generate' ? (
                <>
                  <label
                    htmlFor="prompt"
                    className="relative z-10 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300"
                  >
                    Prompt Input
                  </label>
                  <textarea
                    id="prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={loading}
                    placeholder="Draft your benchmark prompt, constraints, and expected behavior here..."
                    className="relative z-10 mt-4 h-full min-h-[360px] flex-1 resize-none rounded-2xl border border-zinc-700/90 bg-zinc-950/70 p-5 text-sm leading-7 text-zinc-100 outline-none transition-all duration-200 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <div className="relative z-10 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => runBenchmark('raw')}
                      className="inline-flex items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900/70 px-5 py-3 text-sm font-medium text-zinc-100 transition-all duration-200 hover:border-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && modeLabel === 'Raw AI Mode'
                        ? 'Running...'
                        : 'Run Raw AI'}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => runBenchmark('sentinel')}
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/90 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_25px_rgba(34,211,238,0.35)] transition-all duration-200 hover:bg-cyan-300 hover:shadow-[0_0_35px_rgba(34,211,238,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && modeLabel === 'Sentinel Mode'
                        ? 'Running...'
                        : 'Run Sentinel'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label
                    htmlFor="improve-code"
                    className="relative z-10 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300"
                  >
                    Paste Code to Audit & Improve
                  </label>
                  <textarea
                    id="improve-code"
                    value={pastedCode}
                    onChange={(event) => setPastedCode(event.target.value)}
                    disabled={loading}
                    placeholder="Paste your existing code here for Sentinel analysis and hardening..."
                    className="relative z-10 mt-4 h-full min-h-[360px] flex-1 resize-none rounded-2xl border border-zinc-700/90 bg-zinc-950/70 p-5 font-mono text-sm leading-7 text-zinc-100 outline-none transition-all duration-200 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <div className="relative z-10 mt-5">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => runBenchmark('improve')}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/90 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_25px_rgba(34,211,238,0.35)] transition-all duration-200 hover:bg-cyan-300 hover:shadow-[0_0_35px_rgba(34,211,238,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && modeLabel === 'Improve Existing Code'
                        ? 'Running...'
                        : 'Run Sentinel'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {hasRun && (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-[0_14px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                  Generated Output
                </h2>

                {activeTab === 'improve' && (
                  <p className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-sm text-cyan-100/90">
                    Sentinel performed a structured reliability audit and applied
                    automated corrections.
                  </p>
                )}

                <div className="mb-2 mt-4 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
                    Baseline Output
                  </p>
                  {baselineCode && (
                    <button
                      type="button"
                      onClick={() => copyCode(baselineCode, 'baseline')}
                      onBlur={() => setCopiedCode(null)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 transition hover:bg-zinc-800"
                    >
                      {copiedCode === 'baseline' ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>

                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300">
                  {baselineCode ?? '--'}
                </pre>

                {finalCode !== null && (
                  <>
                    <div className="mb-2 mt-4 flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
                        Improved Output
                      </p>
                      {finalCode && (
                        <button
                          type="button"
                          onClick={() => copyCode(finalCode, 'final')}
                          onBlur={() => setCopiedCode(null)}
                          className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 transition hover:bg-cyan-500/20"
                        >
                          {copiedCode === 'final' ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </div>

                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300">
                      {finalCode}
                    </pre>

                    <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-cyan-200/80">
                        Improvement Summary
                      </p>
                      <p className="text-sm leading-6 text-zinc-300">
                        {improvementSummary ?? '--'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          <aside className="lg:col-span-4">
            <div className="flex h-full min-h-[520px] flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/45 p-4 shadow-[0_12px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                Reliability Dashboard
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-4">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                    Raw AI Score
                  </p>
                  <p
                    className={`mt-2 text-3xl font-semibold leading-none text-zinc-200 transition-opacity duration-500 ${
                      hasRun ? 'opacity-100' : 'opacity-70'
                    }`}
                  >
                    {hasRun ? `${initialScore}%` : '--'}
                  </p>
                </div>

                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/90">
                    Sentinel Score
                  </p>
                  <p
                    className={`mt-2 text-5xl font-bold leading-none text-cyan-300 transition-opacity duration-500 ${
                      hasRun ? 'opacity-100' : 'opacity-70'
                    }`}
                  >
                    {hasRun ? `${animatedFinal}%` : '--'}
                  </p>
                  <div
                    className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${status.borderClass} ${status.bgClass} ${status.textClass}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`}
                    />
                    <span>{status.label}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/65 p-4">
                  <p className="text-sm font-medium text-zinc-200">
                    Reliability Evolution
                  </p>

                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                        <p className="text-zinc-500">Initial</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-200">
                          {hasRun ? `${initialScore}%` : '--'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                        <p className="text-zinc-500">Final</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-100">
                          {hasRun ? `${animatedFinal}%` : '--'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                        <p className="text-zinc-500">Delta</p>
                        <p
                          className={`mt-1 text-sm font-semibold ${
                            hasRun && delta > 0
                              ? 'text-cyan-300'
                              : 'text-zinc-300'
                          }`}
                        >
                          {animationComplete
                            ? `${delta > 0 ? '+' : ''}${delta}%`
                            : '--'}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`h-3 w-full overflow-hidden rounded-full bg-zinc-800 ${
                        loading ? 'animate-pulse' : ''
                      }`}
                    >
                      <div
                        className={`h-full transition-all duration-1000 ease-out ${
                          hasRun && animatedFinal > initialScore
                            ? 'bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.45)]'
                            : 'bg-zinc-500'
                        }`}
                        style={{ width: `${hasRun ? animatedFinal : 0}%` }}
                      />
                    </div>

                    {!hasRun && (
                      <div className="rounded-lg border border-zinc-800/90 bg-zinc-900/50 px-3 py-2 text-center text-xs text-zinc-500">
                        Run a benchmark to view reliability evolution.
                      </div>
                    )}

                    {hasRun && animationComplete && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1 text-xs font-medium text-zinc-300">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isImproved ? 'bg-cyan-300' : 'bg-zinc-500'
                          }`}
                        />
                        <span>
                          {isImproved
                            ? `${delta > 0 ? '+' : ''}${delta}% Reliability Gain`
                            : 'No reliability gain detected'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/65 p-4">
                  <p className="text-sm font-medium text-zinc-200">
                    Risk Breakdown
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                    {RISK_LABELS.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between rounded-lg border border-zinc-700/80 bg-zinc-900/70 px-3 py-2 text-zinc-300"
                      >
                        <span>{item.label}</span>
                        <span className="text-zinc-400">
                          {riskBreakdown?.[item.key] ?? '--'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/65 p-4">
                  <p className="text-sm font-medium text-zinc-200">
                    Confidence Panel
                  </p>
                  <div className="mt-3 space-y-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 p-3">
                    <div className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs">
                      <span className="text-zinc-400">
                        Planning Confidence
                      </span>
                      <span className="font-medium text-zinc-200">
                        {confidence?.planningConfidence ?? '--'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs">
                      <span className="text-zinc-400">
                        Implementation Confidence
                      </span>
                      <span className="font-medium text-zinc-200">
                        {confidence?.implementationConfidence ?? '--'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs">
                      <span className="text-zinc-400">
                        Security Confidence
                      </span>
                      <span className="font-medium text-zinc-200">
                        {confidence?.securityConfidence ?? '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>

      <style jsx>{`
        .agent-log-entry {
          animation: agent-log-enter 180ms ease-out both;
          will-change: opacity, transform;
        }

        .agent-log-cursor {
          animation: agent-cursor-pulse 900ms ease-in-out infinite;
        }

        @keyframes agent-log-enter {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes agent-cursor-pulse {
          0%,
          100% {
            opacity: 0.25;
          }
          50% {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .agent-log-entry,
          .agent-log-cursor {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}