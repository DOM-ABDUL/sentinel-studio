'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Mode = 'raw' | 'sentinel' | 'improve';

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

type RawResponse = {
  baselineCode: string;
  evaluation: {
    reliabilityScore: number;
    riskBreakdown: RiskBreakdown;
    confidence: Confidence;
  };
  logs: string[]; // <-- ADD THIS
};

type HardenedResponse = {
  baselineCode: string;
  finalCode: string;
  initialEvaluation: {
    reliabilityScore: number;
  };
  finalEvaluation: {
    reliabilityScore: number;
    riskBreakdown: RiskBreakdown;
    confidence: Confidence;
  };
  improvementSummary: string;
  logs: string[]; // <-- ADD THIS
};

const RISK_LABELS: Array<{ key: keyof RiskBreakdown; label: string }> = [
  { key: 'validation', label: 'Validation' },
  { key: 'authentication', label: 'Authentication' },
  { key: 'secretHandling', label: 'Secret Handling' },
  { key: 'errorHandling', label: 'Error Handling' },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  type LogEntry = {
  message: string;
  timestamp: string;
};

const [logs, setLogs] = useState<LogEntry[]>([]);
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const [riskBreakdown, setRiskBreakdown] = useState<RiskBreakdown | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  const [baselineCode, setBaselineCode] = useState<string | null>(null);
  const [finalCode, setFinalCode] = useState<string | null>(null);
  const [improvementSummary, setImprovementSummary] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<'baseline' | 'final' | null>(null);

  useEffect(() => {
    if (!hasRun || finalScore <= 0) return;

    let start = 0;
    const end = finalScore;
    const duration = 1000;
    const incrementTime = 16;
    const step = end / (duration / incrementTime);

    const counter = setInterval(() => {
      start += step;
      if (start >= end) {
        start = end;
        clearInterval(counter);
      }
      setAnimatedFinal(Math.floor(start));
    }, incrementTime);

    return () => clearInterval(counter);
  }, [finalScore, hasRun]);
  useEffect(() => {
  // Reset UI when switching tabs
  setHasRun(false);
  setBaselineCode(null);
  setFinalCode(null);
  setImprovementSummary(null);
  setLogs([]);
  setInitialScore(0);
  setFinalScore(0);
  setAnimatedFinal(0);
}, [activeTab]);
useEffect(() => {
  if (logRef.current) {
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }
}, [logs]);

  const delta = finalScore - initialScore;
  const animationComplete = hasRun && animatedFinal === finalScore;
  const isImproved = hasRun && delta > 0;

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
function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString();
}

async function streamLogs(entries: string[]) {
  
  for (const entry of entries) {
    await wait(120);
    setLogs((prev) => [
      ...prev,
      { message: entry, timestamp: formatTime() },
    ]);
  }
}
async function copyCode(code: string, type: 'baseline' | 'final') {
  try {
    await navigator.clipboard.writeText(code);
    setCopiedCode(type);

    setTimeout(() => {
      setCopiedCode(null);
    }, 1500);
  } catch {
    setCopiedCode(null);
  }
}

  async function runBenchmark(mode: Mode) {
    const isImprove = mode === 'improve';
    const promptInput = prompt.trim();
    const codeInput = pastedCode.trim();

    if ((!isImprove && !promptInput) || (isImprove && !codeInput) || loading) return;

    setLoading(true);
    setHasRun(false);
    setAnimatedFinal(0);
    setBaselineCode(null);
    setFinalCode(null);
    setImprovementSummary(null);

    if (mode === 'raw') {
  setModeLabel('Raw AI Mode');
} else if (mode === 'sentinel') {
  setModeLabel('Sentinel Mode');
} else {
  setModeLabel('Improve Existing Code');
}

setLogs([]); 
await wait(50);

    try {
      const body =
        mode === 'improve'
          ? { mode: 'improve', code: codeInput }
          : { prompt: promptInput, mode };

      const res = await fetch('/api/run-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Request failed');
      }

           if (mode === 'raw') {
        const data = (await res.json()) as RawResponse;

        
        await streamLogs(data.logs);

        const score = data.evaluation.reliabilityScore;
        setInitialScore(score);
        setFinalScore(score);
        setRiskBreakdown(data.evaluation.riskBreakdown);
        setConfidence(data.evaluation.confidence);
        setBaselineCode(data.baselineCode);
        setFinalCode(null);
        setImprovementSummary(null);
        setHasRun(true);
            } else {
        const data = (await res.json()) as HardenedResponse;

        // Stream the REAL logs from the backend
        await streamLogs(data.logs);

        setInitialScore(data.initialEvaluation.reliabilityScore);
        setFinalScore(data.finalEvaluation.reliabilityScore);
        setRiskBreakdown(data.finalEvaluation.riskBreakdown);
        setConfidence(data.finalEvaluation.confidence);
        setBaselineCode(data.baselineCode);
        setFinalCode(data.finalCode);
        setImprovementSummary(data.improvementSummary);
        setHasRun(true);
      }
   } catch {
  setLogs((prev) => [
    ...prev,
    {
      message: 'Benchmark run failed. Please try again.',
      timestamp: formatTime(),
    },
  ]);
} finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="pb-8 pt-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Sentinel Studio</h1>
          <p className="mt-2 text-sm text-zinc-400 sm:text-base">Multi-Agent AI Code Reliability & Self-Healing System</p>
          {modeLabel && <p className="mt-2 text-xs uppercase tracking-[0.14em] text-cyan-400">{modeLabel}</p>}
          <div className="mx-auto mt-5 h-px w-56 bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
        </header>

        <section className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
          <aside className="lg:col-span-3 xl:col-span-2">
            <div className="flex h-full min-h-[520px] flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/45 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Agent Activity</h2>
                <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-400">
                  Stream
                </span>
              </div>

              
              <div
  ref={logRef}
  className="h-full min-h-[420px] flex-1 overflow-y-auto rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-3 text-xs leading-6"
>
  {logs.length === 0 ? (
    <div className="text-zinc-500">
      [No active logs yet. Run a benchmark.]
    </div>
  ) : (
    logs.map((log, index) => {
      let color = "text-zinc-400";

      if (log.message.includes("[Planner]")) color = "text-cyan-400";
      else if (log.message.includes("[Builder]")) color = "text-blue-400";
      else if (log.message.includes("[Evaluator]")) color = "text-amber-400";
      else if (log.message.includes("[Self-Healer]")) color = "text-rose-400";
      else if (log.message.includes("[System]")) color = "text-emerald-400";

      return (
        <div key={index} className={`mb-1 ${color}`}>
          <span className="text-zinc-500">
            [{log.timestamp}]
          </span>{" "}
          {log.message}
        </div>
      );
    })
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
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'generate'
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                  }`}
                >
                  Generate Code
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('improve')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'improve'
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                  }`}
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
                    onChange={(e) => setPrompt(e.target.value)}
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
                      {loading && modeLabel === 'Raw AI Mode' ? 'Running...' : 'Run Raw AI'}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => runBenchmark('sentinel')}
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/90 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_25px_rgba(34,211,238,0.35)] transition-all duration-200 hover:bg-cyan-300 hover:shadow-[0_0_35px_rgba(34,211,238,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && modeLabel === 'Sentinel Mode' ? 'Running...' : 'Run Sentinel'}
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
                    onChange={(e) => setPastedCode(e.target.value)}
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
                      {loading && modeLabel === 'Improve Existing Code' ? 'Running...' : 'Run Sentinel'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {hasRun && (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-[0_14px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Generated Output</h2>

                {activeTab === 'improve' && (
                  <p className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-sm text-cyan-100/90">
                   Sentinel performed a structured reliability audit and applied automated corrections.
                  </p>
                )}

                <div className="mb-2 flex items-center justify-between">
  <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
    Baseline Output
  </p>

  {baselineCode && (
    <button
      type="button"
      onClick={() => copyCode(baselineCode, 'baseline')}
      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 transition hover:bg-zinc-800"
    >
      {copiedCode === 'baseline' ? 'Copied' : 'Copy'}
    </button>
  )}
</div>
<pre className="max-h-64 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre-wrap break-words">
  {baselineCode ?? '--'}
</pre>

                  {finalCode !== null && (
                    <>
                      <div className="mb-2 flex items-center justify-between">
  <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
    Improved Output
  </p>

  {finalCode && (
    <button
      type="button"
      onClick={() => copyCode(finalCode, 'final')}
      className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 transition hover:bg-cyan-500/20"
    >
      {copiedCode === 'final' ? 'Copied' : 'Copy'}
    </button>
  )}
</div>
<pre className="max-h-64 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre-wrap break-words">
  {finalCode}
</pre>

                      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-cyan-200/80">
                          Improvement Summary
                        </p>
                        <p className="text-sm leading-6 text-zinc-300">{improvementSummary ?? '--'}</p>
                      </div>
                    </>
                  )}
                </div>
              
            )}
          </section>

          <aside className="lg:col-span-4">
            <div className="flex h-full min-h-[520px] flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/45 p-4 shadow-[0_12px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Reliability Dashboard</h2>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-4">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">Raw AI Score</p>
                  <p
                    className={`mt-2 text-3xl font-semibold leading-none text-zinc-200 transition-opacity duration-500 ${
                      hasRun ? 'opacity-100' : 'opacity-70'
                    }`}
                  >
                    {hasRun ? `${initialScore}%` : '--'}
                  </p>
                </div>

                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/90">Sentinel Score</p>
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
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                    <span>{status.label}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/65 p-4">
                  <p className="text-sm font-medium text-zinc-200">Reliability Evolution</p>

                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                        <p className="text-zinc-500">Initial</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-200">{hasRun ? `${initialScore}%` : '--'}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                        <p className="text-zinc-500">Final</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-100">{hasRun ? `${animatedFinal}%` : '--'}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                        <p className="text-zinc-500">Delta</p>
                        <p
                          className={`mt-1 text-sm font-semibold ${
                            hasRun && delta > 0 ? 'text-cyan-300' : 'text-zinc-300'
                          }`}
                        >
                          {animationComplete ? `${delta > 0 ? '+' : ''}${delta}%` : '--'}
                        </p>
                      </div>
                    </div>

                    <div className={`h-3 w-full overflow-hidden rounded-full bg-zinc-800 ${loading ? 'animate-pulse' : ''}`}>
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
                        <span className={`h-1.5 w-1.5 rounded-full ${isImproved ? 'bg-cyan-300' : 'bg-zinc-500'}`} />
                        <span>
                          {isImproved ? `${delta > 0 ? '+' : ''}${delta}% Reliability Gain` : 'No reliability gain detected'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/65 p-4">
                  <p className="text-sm font-medium text-zinc-200">Risk Breakdown</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                    {RISK_LABELS.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between rounded-lg border border-zinc-700/80 bg-zinc-900/70 px-3 py-2 text-zinc-300"
                      >
                        <span>{item.label}</span>
                        <span className="text-zinc-400">{riskBreakdown?.[item.key] ?? '--'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/65 p-4">
                  <p className="text-sm font-medium text-zinc-200">Confidence Panel</p>
                  <div className="mt-3 space-y-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 p-3">
                    <div className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs">
                      <span className="text-zinc-400">Planning Confidence</span>
                      <span className="font-medium text-zinc-200">{confidence?.planningConfidence ?? '--'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs">
                      <span className="text-zinc-400">Implementation Confidence</span>
                      <span className="font-medium text-zinc-200">{confidence?.implementationConfidence ?? '--'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs">
                      <span className="text-zinc-400">Security Confidence</span>
                      <span className="font-medium text-zinc-200">{confidence?.securityConfidence ?? '--'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
