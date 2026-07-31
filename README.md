# 🛡️ Sentinel Studio  
### A Multi‑Agent Reliability & Self‑Healing Control Layer for AI‑Generated Backend Code  

Built with OpenAI Codex

---

## 🌐 Live Application

**Deployed App (No Login Required)**  
 https://sentinel-studio-sigma.vercel.app/

**GitHub Repository**  
 https://github.com/DOM-ABDUL/sentinel-studio

---

# 📸 Interface Preview

## Main Dashboard

![Main Dashboard](docs/screenshots/main-dashboard.png)

---

## Reliability Surge — Before vs After Self-Healing

![Reliability Surge](docs/screenshots/reliability-surge.png)

Sentinel Mode demonstrates measurable reliability improvement through automated self‑healing.

---

## Diff View — Baseline vs Hardened Output

![Diff View](docs/screenshots/diff-view.png)

Clear visibility into structural changes made by the Self‑Healer Agent.

---

## Downloadable Reliability Report (PDF)

![PDF Report](docs/screenshots/pdf-report.png)

Each execution generates a structured audit report including:
- Reliability transition
- Security scores
- Detected issues
- Execution trace
- Improvement summary

---

#  The Problem

AI can generate backend systems in seconds.

But **generation is not verification**.

AI‑produced backend code frequently includes:

- Hardcoded secrets  
- Missing input validation  
- Weak authentication logic  
- Incomplete error handling  
- Hallucinated or insecure dependencies  

The code may compile.  
It may even look correct.  

But it has not been systematically evaluated.

There is no reliability control layer between **AI generation** and **production deployment**.

---

#  The Solution

**Sentinel Studio introduces that missing control layer.**

Instead of trusting a single AI response, Sentinel runs each request through a structured multi‑agent workflow that:

1. Plans the architecture  
2. Generates the implementation  
3. Audits and scores reliability  
4. Automatically refactors vulnerabilities  
5. Re‑evaluates before returning final output  

The shift is simple:

> From  
> **“AI generated this.”**  
>  
> To  
> **“AI generated, evaluated, and improved this.”**

---

#  Multi‑Agent Architecture

Sentinel Studio uses OpenAI Codex in a structured agent pipeline with strict role separation:

```
Planner → Builder → Evaluator → Self‑Healer → Re‑Evaluator
```

Each stage produces structured JSON outputs before execution proceeds.

---

## 1️⃣ Planner Agent

Analyzes the user request and defines:

- Tech stack
- File structure
- API routes
- Database schema
- Security considerations
- Edge cases

Returns structured architectural intent.

---

## 2️⃣ Builder Agent

Implements backend logic according to the plan.

Constraints enforced:
- No invented dependencies
- No hardcoded secrets
- Explicit input validation
- Defensive programming
- Structured error handling

---

## 3️⃣ Evaluator Agent

Performs structured static analysis and returns:

- Reliability Score (0–100)
- Security Score (0–100)
- Hallucination Risk (low / medium / high)
- Risk Breakdown:
  - Validation
  - Authentication
  - Secret handling
  - Error handling
- Confidence Report
- Issue List

All responses are schema‑validated before advancing.

---

## 4️ Self‑Healer Agent

If reliability or security score falls below 85:

- Consumes evaluator findings
- Refactors vulnerable code
- Removes unsafe patterns
- Improves validation and error boundaries
- Re‑evaluates until thresholds are satisfied

This forms a closed reliability loop.

---

# Agentic Capabilities Demonstrated

- Explicit role separation
- Multi‑step reasoning
- Structured JSON enforcement
- Schema validation with drift tolerance
- Conditional re‑execution
- Reliability gating
- Iterative improvement loop
- Streaming execution trace

This goes beyond single‑prompt code generation.

---

#  Execution Modes

## 🔹 Raw Mode

Simulates a single‑pass AI generator.

- One generation
- One evaluation
- Baseline reliability score

---

## 🔹 Sentinel Mode

Runs the full pipeline:

Planning → Building → Auditing → Healing → Final Score

Displays measurable reliability improvement (delta).

---

## 🔹 Improve Existing Code

Audits user‑provided backend code and returns:

- Structured vulnerability report
- Hardened refactored version
- Reliability transition
- Diff visualization
- Downloadable PDF audit report

---

#  Reliability Dashboard

Sentinel Studio includes:

- Reliability transition visualization
- Risk breakdown panel
- Confidence panel
- Execution trace log
- Diff view (baseline vs improved)
- PDF exportable audit report

This makes improvements measurable and transparent.

---

#  Architecture

Clear separation of concerns:

```
app/
 ├── page.tsx                 → UI Layer
 ├── api/run-agents/route.ts  → Streaming Orchestration Layer

lib/
 └── agents.ts                → Multi-Agent Codex Logic
```

- Streaming JSON event architecture
- Strict evaluation validation
- Conditional self-healing loop
- UI isolated from orchestration

---

# 🛠 Tech Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- OpenAI SDK (GPT‑4.1 / GPT‑4o)
- Streaming API architecture
- jsPDF reporting
- Vercel deployment

---

#  Use of Codex (Agentic Depth)

Codex is used as a reasoning engine — not autocomplete.

It powers:

- Architecture planning
- Structured backend generation
- Static reliability analysis
- JSON‑validated structured outputs
- Conditional self‑healing rewrite loops
- Iterative re‑evaluation logic
- Schema debugging and validation refinement

For a detailed breakdown of how Codex was used throughout development — including architectural reasoning, structured output enforcement, debugging workflows, and multi-agent orchestration — see:

 **[CODEX_USAGE.md](./CODEX_USAGE.md)**

---

#  Local Development

```bash
git clone https://github.com/DOM-ABDUL/sentinel-studio.git
cd sentinel-studio
npm install
```

Create `.env`:

```
OPENAI_API_KEY=your_key_here
```

Run:

```bash
npm run dev
```

Visit:

```
http://localhost:3000
```

---

#  Why It Matters

As AI coding tools become default development infrastructure, the risk shifts:

Not slow development —  
but silent production failure.

Sentinel Studio introduces a reliability checkpoint before trust.

It treats AI‑generated code as a draft — not a deployable artifact.

---

#  Future Work

- Runtime sandbox execution tests
- CI/CD reliability gating
- GitHub PR integration
- Continuous reliability monitoring
- Automated security classification

---

#  Final Statement

AI can write code.

Sentinel Studio asks a more important question:

> **Should that code be trusted yet?**

