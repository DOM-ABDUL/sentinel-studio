'use client';

import { useEffect, useMemo, useState } from 'react';

type Mode = 'raw' | 'sentinel' | 'improve';
type Phase = 'Planner' | 'Builder' | 'Evaluator' | 'Self-Healer';
type OutputTab = 'diff' | 'baseline' | 'improved';

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
  mode: 'raw';
  baselineCode: string;
  evaluation: {
    reliabilityScore: number;
    securityScore: number;
    riskBreakdown: RiskBreakdown;
    confidence: Confidence;
    issues: string[];
  };
};

type HardenedResponse = {
  mode: 'sentinel' | 'improve';
  baselineCode: string;
  finalCode: string;
  initialEvaluation: {
    reliabilityScore: number;
    securityScore: number;
    issues: string[];
  };
  finalEvaluation: {
    reliabilityScore: number;
    securityScore: number;
    riskBreakdown: RiskBreakdown;
    confidence: Confidence;
    issues: string[];
  };
  improvementSummary: string;
};

type StreamPayload = RawResponse | HardenedResponse;

type DiffRow = {
  left: string;
  right: string;
  kind: 'unchanged' | 'added' | 'removed' | 'changed';
};

const PHASES: Phase[] = ['Planner', 'Builder', 'Evaluator', 'Self-Healer'];

const RISK_LABELS: Array<{ key: keyof RiskBreakdown; label: string }> = [
  { key: 'validation', label: 'Validation' },
  { key: 'authentication', label: 'Authentication' },
  { key: 'secretHandling', label: 'Secret Handling' },
  { key: 'errorHandling', label: 'Error Handling' },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLineDiffRows(baseline: string, improved: string): DiffRow[] {
  const baselineLines = baseline.split('\n');
  const improvedLines = improved.split('\n');
  const max = Math.max(baselineLines.length, improvedLines.length);
  const rows: DiffRow[] = [];

  for (let i = 0; i < max; i += 1) {
    const left = baselineLines[i] ?? '';
    const right = improvedLines[i] ?? '';

    if (left === right) {
      rows.push({ left, right, kind: 'unchanged' });
    } else if (!left && right) {
      rows.push({ left: '', right, kind: 'added' });
    } else if (left && !right) {
      rows.push({ left, right: '', kind: 'removed' });
    } else {
      rows.push({ left, right, kind: 'changed' });
    }
  }

  return rows;
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

  const [logs, setLogs] = useState<string[]>([]);
  const [modeLabel, setModeLabel] = useState<string | null>(null);

  const [riskBreakdown, setRiskBreakdown] = useState<RiskBreakdown | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [initialSecurity, setInitialSecurity] = useState<number | null>(null);
  const [finalSecurity, setFinalSecurity] = useState<number | null>(null);
  const [detectedIssues, setDetectedIssues] = useState<string[]>([]);

  const [baselineCode, setBaselineCode] = useState<string | null>(null);
  const [finalCode, setFinalCode] = useState<string | null>(null);
  const [improvementSummary, setImprovementSummary] = useState<string | null>(null);

  const [outputTab, setOutputTab] = useState<OutputTab>('baseline');
  const [copiedCode, setCopiedCode] = useState<'baseline' | 'improved' | null>(null);

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
    if (!hasRun) {
      setOutputTab('baseline');
      return;
    }

    if (finalCode !== null) {
      setOutputTab('diff');
    } else {
      setOutputTab('baseline');
    }
  }, [hasRun, finalCode, activeTab]);

  const delta = finalScore - initialScore;
  const animationComplete = hasRun && animatedFinal === finalScore;
  const isImproved = hasRun && delta > 0;

  const currentResultMode: Mode | null = hasRun
    ? finalCode === null
      ? 'raw'
      : activeTab === 'improve'
        ? 'improve'
        : 'sentinel'
    : null;

  const phaseProgress = useMemo(() => {
    if (!hasRun) return 0;
    const touched = {
      Planner: logs.some((line) => line.includes('[Planner]')),
      Builder: logs.some((line) => line.includes('[Builder]')),
      Evaluator: logs.some((line) => line.includes('[Evaluator]')),
      'Self-Healer': logs.some((line) => line.includes('[Self-Healer]')),
    };

    const completeCount = Object.values(touched).filter(Boolean).length;
    return (completeCount / PHASES.length) * 100;
  }, [logs, hasRun]);

  const diffRows = useMemo(() => {
    if (!baselineCode || finalCode === null) return [] as DiffRow[];
    return buildLineDiffRows(baselineCode, finalCode);
  }, [baselineCode, finalCode]);

  const noCodeDiff = useMemo(() => {
    if (!baselineCode || finalCode === null) return false;
    return baselineCode.trim() === finalCode.trim();
  }, [baselineCode, finalCode]);

const selfHealingTriggered =
  currentResultMode !== 'raw' &&
  baselineCode !== null &&
  finalCode !== null &&
  baselineCode.trim() !== finalCode.trim();

  const selfHealingReasons = useMemo(() => {
    if (!hasRun || currentResultMode === 'raw') return [] as string[];

    const reasons: string[] = [];

    if (selfHealingTriggered) {
     reasons.push(
  `Self-healing triggered because initial reliability (${initialScore}%) or security (${initialSecurity ?? '--'}%) was below Sentinel thresholds.`
);
reasons.push(
  `Post-healing reliability is ${finalScore}%.`
);
    } else {
      reasons.push(
        'Evaluation completed. No corrective refactor was required because reliability and security thresholds were satisfied.',
      );
    }

    return reasons;
  }, [hasRun, currentResultMode, selfHealingTriggered, delta]);

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

 function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

  async function copyCode(code: string, type: 'baseline' | 'improved') {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(type);
      setTimeout(() => setCopiedCode(null), 1200);
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
    setInitialSecurity(null);
    setFinalSecurity(null);
    setDetectedIssues([]);

    if (mode === 'raw') {
      setModeLabel('Raw AI Mode');
      setLogs(['Running Raw AI baseline benchmark...']);
    } else if (mode === 'sentinel') {
      setModeLabel('Sentinel Mode');
      setLogs(['Initializing Sentinel multi-agent pipeline...']);
    } else {
      setModeLabel('Improve Existing Code');
      setLogs(['Auditing submitted code with Sentinel...']);
    }

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

      if (!res.body) {
        throw new Error('Streaming is unavailable for this request.');
      }

      // The API streams newline-delimited JSON events, so we read incrementally.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (line: string) => {
        if (!line.trim()) return;

        const event = JSON.parse(line) as
          | { type: 'log'; message: string }
          | { type: 'error'; message: string }
          | { type: 'complete'; payload: StreamPayload };

        if (event.type === 'log') {
          setLogs((prev) => [...prev, event.message]);
          return;
        }

        if (event.type === 'error') {
          setLogs((prev) => [...prev, `[System] ${event.message}`]);
          return;
        }

        const data = event.payload;

        if (data.mode === 'raw') {
          const score = data.evaluation.reliabilityScore;
          setInitialScore(score);
          setFinalScore(score);
          setRiskBreakdown(data.evaluation.riskBreakdown);
          setConfidence(data.evaluation.confidence);
          setInitialSecurity(null);
          setFinalSecurity(null);
          setDetectedIssues([]);
          setBaselineCode(data.baselineCode);
          setFinalCode(null);
          setImprovementSummary(null);
        } else {
          setInitialScore(data.initialEvaluation.reliabilityScore);
          setFinalScore(data.finalEvaluation.reliabilityScore);
          setInitialSecurity(data.initialEvaluation.securityScore);
          setFinalSecurity(data.finalEvaluation.securityScore);
          setDetectedIssues(data.initialEvaluation.issues);
          setRiskBreakdown(data.finalEvaluation.riskBreakdown);
          setConfidence(data.finalEvaluation.confidence);
          setBaselineCode(data.baselineCode);
          setFinalCode(data.finalCode);
          setImprovementSummary(data.improvementSummary);
        }

        setHasRun(true);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          handleEvent(line);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        handleEvent(buffer);
      }
    } catch {
      setLogs((prev) => [...prev, 'Benchmark run failed. Please try again.']);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="pb-8 pt-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Sentinel Studio</h1>
          <p className="mt-2 text-sm text-zinc-400 sm:text-base">AI Reliability Benchmarking System</p>
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

              <div className="mb-3 rounded-xl border border-zinc-800/90 bg-zinc-950/65 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Agent Trace View</p>
                <div className="mt-2 space-y-1.5">
                  {PHASES.map((phase) => {
                    const seen = logs.some((line) => line.includes(`[${phase}]`));
                    return (
                      <div key={phase} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-[11px]">
                        <span className="text-zinc-300">{phase}</span>
                        <span className={seen ? 'text-emerald-300' : 'text-zinc-500'}>{seen ? 'Completed' : 'Pending'}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Reliability Transition</span>
                    <span className="text-zinc-200">{hasRun ? `${initialScore}% → ${finalScore}%` : '--'}</span>
                  </div>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-cyan-400 transition-all duration-500" style={{ width: `${phaseProgress}%` }} />
                </div>
              </div>

              <textarea
                readOnly
                value={logs.length ? logs.join('\n') : '[No active logs yet. Run a benchmark.]'}
                className="h-full min-h-[420px] flex-1 resize-none rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-3 text-xs leading-6 text-zinc-400 outline-none"
              />
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
                <div className="relative z-10 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Reliability</p>
                      <p className="mt-1 text-3xl font-bold text-cyan-300">{hasRun ? `${animatedFinal}%` : '--'}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Delta</p>
                      <p className={`mt-1 text-2xl font-semibold ${hasRun && delta > 0 ? 'text-cyan-300' : 'text-zinc-300'}`}>
                        {animationComplete ? `${delta > 0 ? '+' : ''}${delta}%` : '--'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Status</p>
                      <div
                        className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${status.borderClass} ${status.bgClass} ${status.textClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                        <span>{status.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Input Code</p>
                      <textarea
                        id="improve-code"
                        value={pastedCode}
                        onChange={(e) => setPastedCode(e.target.value)}
                        disabled={loading}
                        placeholder="Paste your existing code here for Sentinel analysis and hardening..."
                        className="h-[340px] w-full resize-none overflow-auto rounded-lg border border-zinc-800/90 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-200 outline-none transition-colors focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Improved Code</p>
                      <pre className="h-[340px] overflow-auto rounded-lg border border-zinc-800/90 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre-wrap break-words">
                        {finalCode ?? '[Improved output will appear here after Sentinel run.]'}
                      </pre>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => runBenchmark('improve')}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/90 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_25px_rgba(34,211,238,0.35)] transition-all duration-200 hover:bg-cyan-300 hover:shadow-[0_0_35px_rgba(34,211,238,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading && modeLabel === 'Improve Existing Code' ? 'Running...' : 'Run Sentinel'}
                  </button>
                </div>
              )}
            </div>

            {hasRun && (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-[0_14px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Generated Output</h2>

                {(currentResultMode === 'sentinel' || currentResultMode === 'improve') && (
                  <div className="mt-4 rounded-2xl border border-zinc-700/70 bg-gradient-to-b from-zinc-900/85 to-zinc-950/85 p-[1px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                    <div className="rounded-2xl bg-zinc-950/85 p-4">
                      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-zinc-300">Self-Healing Decision</p>
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                            selfHealingTriggered
                              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                              : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${selfHealingTriggered ? 'bg-emerald-300' : 'bg-amber-300'}`} />
                          {selfHealingTriggered ? 'Triggered' : 'Not Triggered'}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                          <p className="text-zinc-500">Initial Reliability</p>
                          <p className="mt-1 font-semibold text-zinc-200">{initialScore}%</p>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                          <p className="text-zinc-500">Initial Security</p>
                          <p className="mt-1 font-semibold text-zinc-200">{initialSecurity !== null ? `${initialSecurity}%` : '--'}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                          <p className="text-zinc-500">Final Reliability</p>
                          <p className="mt-1 font-semibold text-zinc-200">{finalScore}%</p>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                          <p className="text-zinc-500">Reliability Delta</p>
                          <p className={`mt-1 font-semibold ${delta > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {delta > 0 ? `+${delta}` : delta}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-zinc-800/80 pt-3 text-xs sm:grid-cols-2">
                        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-zinc-300">
                          <p className="text-zinc-500">Initial Security Score</p>
                          <p className="mt-1">{initialSecurity !== null ? `${initialSecurity}%` : '--'}</p>
                        </div>
                        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-zinc-300">
                          <p className="text-zinc-500">Final Security Score</p>
                          <p className="mt-1">{finalSecurity !== null ? `${finalSecurity}%` : '--'}</p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                        <p className="font-medium uppercase tracking-[0.1em] text-zinc-400">Reasoning</p>
                        <div className="mt-2 space-y-2">
                          {selfHealingReasons.map((reason) => (
                            <div key={reason} className="flex items-start gap-2 text-zinc-300">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-500" />
                              <span>{reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                        <p className="font-medium uppercase tracking-[0.1em] text-zinc-400">Detected Issues</p>
                        {detectedIssues.length === 0 ? (
                          <p className="mt-2 text-zinc-300">No critical issues were detected during evaluation.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {detectedIssues.slice(0, 5).map((issue) => (
                              <div key={issue} className="flex items-start gap-2 text-zinc-300">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-300" />
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-1">
                  {(currentResultMode === 'sentinel' || currentResultMode === 'improve') && (
                    <button
                      type="button"
                      onClick={() => setOutputTab('diff')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        outputTab === 'diff'
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                      }`}
                    >
                      Diff View
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOutputTab('baseline')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      outputTab === 'baseline'
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                    }`}
                  >
                    Baseline
                  </button>
                  {(currentResultMode === 'sentinel' || currentResultMode === 'improve') && (
                    <button
                      type="button"
                      onClick={() => setOutputTab('improved')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        outputTab === 'improved'
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                      }`}
                    >
                      Improved
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  {outputTab === 'diff' && (currentResultMode === 'sentinel' || currentResultMode === 'improve') && (
                    <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4">
                      {noCodeDiff ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-400">
                          No changes detected between baseline and improved output.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          <div className="overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950 p-2">
                            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500">Baseline Code</p>
                            <div className="space-y-0.5 font-mono text-xs leading-6">
                              {diffRows.map((row, index) => (
                                <div
                                  key={`left-${index}-${row.left}`}
                                  className={`rounded px-2 ${
                                    row.kind === 'removed'
                                      ? 'bg-rose-500/10 text-rose-300'
                                      : row.kind === 'changed'
                                        ? 'bg-amber-500/10 text-amber-300'
                                        : 'text-zinc-300'
                                  }`}
                                >
                                  {row.left || ' '}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950 p-2">
                            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500">Improved Code</p>
                            <div className="space-y-0.5 font-mono text-xs leading-6">
                              {diffRows.map((row, index) => (
                                <div
                                  key={`right-${index}-${row.right}`}
                                  className={`rounded px-2 ${
                                    row.kind === 'added'
                                      ? 'bg-emerald-500/10 text-emerald-300'
                                      : row.kind === 'changed'
                                        ? 'bg-amber-500/10 text-amber-300'
                                        : 'text-zinc-300'
                                  }`}
                                >
                                  {row.right || ' '}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {outputTab === 'baseline' && (
                    <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">Baseline Output</p>
                        {baselineCode && (
                          <button
                            type="button"
                            onClick={() => copyCode(baselineCode, 'baseline')}
                            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 transition hover:bg-zinc-800"
                          >
                            {copiedCode === 'baseline' ? 'Copied!' : 'Copy'}
                          </button>
                        )}
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre-wrap break-words">
                        {baselineCode ?? '--'}
                      </pre>
                    </div>
                  )}

                  {outputTab === 'improved' && (currentResultMode === 'sentinel' || currentResultMode === 'improve') && (
                    <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">Improved Output</p>
                        {finalCode && (
                          <button
                            type="button"
                            onClick={() => copyCode(finalCode, 'improved')}
                            className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 transition hover:bg-cyan-500/20"
                          >
                            {copiedCode === 'improved' ? 'Copied!' : 'Copy'}
                          </button>
                        )}
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300 whitespace-pre-wrap break-words">
                        {finalCode ?? '--'}
                      </pre>
                    </div>
                  )}
                </div>

                {(currentResultMode === 'sentinel' || currentResultMode === 'improve') && (
                  <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-cyan-200/80">
                      Improvement Summary
                    </p>
                    <p className="text-sm leading-6 text-zinc-300">{improvementSummary ?? '--'}</p>
                  </div>
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