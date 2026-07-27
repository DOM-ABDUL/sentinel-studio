# CODEX_USAGE.md

# OpenAI Codex Usage in Sentinel Studio

## Overview

Sentinel Studio is built around a structured multi‑agent orchestration pipeline powered by OpenAI Codex (via the OpenAI SDK).

Rather than using Codex as a single-pass code generator, the system separates responsibilities into explicit agent roles that plan, build, evaluate, and iteratively refine backend code before returning a final result.

This demonstrates true agentic behavior: planning, multi-step execution, structured evaluation, and conditional self-correction.

---

# Agent Architecture

Sentinel Studio uses four specialized agents:

---

## 1️⃣ Planner Agent

**Purpose:**  
Decompose the user prompt into a structured backend architecture plan.

**Responsibilities:**
- Define route structure
- Identify required middleware
- Specify security constraints
- Anticipate edge cases
- Establish validation requirements

**Output Requirement:**  
The Planner must return structured JSON following a strict schema before the pipeline proceeds.

### Example Planner Output

```json
{
  "architecture": "Express.js REST API",
  "routes": [
    "POST /register",
    "POST /login"
  ],
  "securityRequirements": [
    "JWT secret stored in environment variable",
    "Input validation required",
    "Password hashing required"
  ],
  "edgeCases": [
    "Duplicate email registration",
    "Invalid password format",
    "Missing request body fields"
  ]
}
```

The Builder agent cannot execute unless this structure is valid.

---

## 2️⃣ Builder Agent

**Purpose:**  
Generate backend implementation code based strictly on the Planner’s blueprint.

**Responsibilities:**
- Implement routes defined by Planner
- Enforce middleware structure
- Follow specified security constraints
- Produce organized and readable backend code

The Builder operates under explicit architectural constraints rather than free-form generation.

---

## 3️⃣ Evaluator Agent

**Purpose:**  
Audit the generated code and produce a quantitative reliability score.

The Evaluator performs structured static analysis across four categories:

- Input Validation
- Authentication Logic
- Secret Handling
- Error Handling

It returns strict JSON that determines whether the pipeline completes or triggers self-healing.

### Example Evaluator Output

```json
{
  "overallScore": 72,
  "validationScore": 60,
  "authenticationScore": 75,
  "secretHandlingScore": 50,
  "errorHandlingScore": 80,
  "issues": [
    "Hardcoded JWT secret detected",
    "Missing validation middleware",
    "Inconsistent error responses"
  ]
}
```

This structured scoring enables deterministic decision-making.

---

## 4️⃣ Self‑Healer Agent

**Trigger Condition:**

```
If overallScore < 85 → Activate Self-Healer
```

**Responsibilities:**
- Ingest Evaluator findings
- Refactor vulnerable sections
- Correct architectural or security flaws
- Re-submit corrected code for final evaluation

This creates a controlled review loop rather than a one-pass output system.

---

# Orchestration Logic

The execution pipeline follows this sequence:

1. User submits prompt
2. Planner generates structured architecture
3. Builder produces implementation
4. Evaluator audits and scores output
5. Conditional check:
   - If score ≥ 85 → Return result
   - If score < 85 → Trigger Self-Healer
6. Self-Healer refactors and re-evaluates
7. Final score returned to frontend

All transitions depend on schema-validated structured outputs.

---

# Agentic Characteristics Demonstrated

Sentinel Studio demonstrates genuine agentic usage through:

- Explicit role separation
- Multi-step reasoning
- Structured JSON schema enforcement
- Conditional execution branching
- Iterative refinement loop
- Quantitative evaluation gating

Codex is used as a reasoning engine and evaluator — not as a simple autocomplete system.

---

# Technical Integration

- OpenAI SDK integration implemented in `lib/agents.ts`
- Orchestration logic handled in `app/api/run-agents/route.ts`
- Strict separation between UI and agent logic
- Structured outputs validated before advancing pipeline

This ensures predictability, transparency, and measurable improvement between Raw Mode and Sentinel Mode.

---

# Conclusion

Sentinel Studio uses OpenAI Codex to simulate a structured engineering workflow rather than a single response generator.

It plans.  
It builds.  
It evaluates.  
It corrects.  

This aligns directly with agentic coding principles and evaluation-driven system design.


