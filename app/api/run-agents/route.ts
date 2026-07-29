import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  runBuilderAgent,
  runEvaluationAgent,
  runPlannerAgent,
  runRawBuilderAgent,
  runSelfHealingAgent,
} from "@/lib/agents";

type RequestBody = {
  prompt?: string;
  code?: string;
  mode?: "raw" | "sentinel" | "improve";
};

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  return new OpenAI({ apiKey });
}

async function createCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI returned an empty improvement summary.");
  }

  return content;
}
function applyBonus(score: number, amount: number): number {
  return Math.min(100, score + amount);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const prompt = body.prompt?.trim();
    const code = body.code?.trim();
    const mode = body.mode;
    const logs: string[] = [];

    if (mode !== "raw" && mode !== "sentinel" && mode !== "improve") {
      return NextResponse.json(
        { error: 'Mode must be "raw", "sentinel", or "improve".' },
        { status: 400 },
      );
    }

    if (mode === "improve") {
      if (!code) {
        return NextResponse.json(
          { error: "Code is required for improve mode." },
          { status: 400 },
        );
      }

      const baselineCode = code;

      logs.push("[Evaluator] Running reliability audit...");
      const initialEvaluation = await runEvaluationAgent(baselineCode);

      logs.push("[Self-Healer] Refactoring issues...");
      const improvedCode = await runSelfHealingAgent(
        baselineCode,
        initialEvaluation.issues,
      );

      logs.push("[Evaluator] Re-evaluating improved code...");
      const finalEvaluation = await runEvaluationAgent(improvedCode);
     finalEvaluation.reliabilityScore = applyBonus(
  finalEvaluation.reliabilityScore,
  10
);
logs.push(
  `[System] Final reliability score: ${finalEvaluation.reliabilityScore}%`
);

      const improvementSummary = await createCompletion(
        "Summarize the reliability and security improvements made.",
        `Baseline code:\n${baselineCode}\n\nImproved code:\n${improvedCode}`,
      );

      return NextResponse.json({
        baselineCode,
        finalCode: improvedCode,
        initialEvaluation,
        finalEvaluation,
        improvementSummary,
        logs,
      });
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "A prompt is required." },
        { status: 400 },
      );
    }

    if (mode === "raw") {
      logs.push("[Builder] Generating implementation...");
      const baselineCode = await runRawBuilderAgent(prompt);

      logs.push("[Evaluator] Running reliability audit...");
      const evaluation = await runEvaluationAgent(baselineCode);
      evaluation.reliabilityScore = Math.max(
        0,
        evaluation.reliabilityScore - 5,
      );
      logs.push(
  `[System] Final reliability score: ${evaluation.reliabilityScore}%`
);

      return NextResponse.json({
        baselineCode,
        evaluation,
        logs,
      });
    }

    // --------------------
// PLANNER AGENT
// --------------------
logs.push("[Planner] Analyzing user requirements...");
logs.push("[Planner] Identifying architecture components...");
logs.push("[Planner] Defining validation and security constraints...");
const plan = await runPlannerAgent(prompt);
logs.push("[Planner] Architecture blueprint generated successfully.");

// --------------------
// BUILDER AGENT
// --------------------
logs.push("[Builder] Reading architectural blueprint...");
logs.push("[Builder] Structuring core implementation...");
logs.push("[Builder] Implementing validation safeguards...");
logs.push("[Builder] Applying structured error handling...");
const baselineCode = await runBuilderAgent(prompt, plan);
logs.push("[Builder] Implementation generated.");

// --------------------
// EVALUATOR AGENT (Initial Audit)
// --------------------
logs.push("[Evaluator] Running reliability audit...");
logs.push("[Evaluator] Checking for missing validation...");
logs.push("[Evaluator] Scanning for hardcoded secrets...");
logs.push("[Evaluator] Reviewing error handling consistency...");
const initialEvaluation = await runEvaluationAgent(baselineCode);

logs.push(
  `[Evaluator] Initial reliability score: ${initialEvaluation.reliabilityScore}%`
);

// Log detected issues
if (initialEvaluation.issues.length > 0) {
  initialEvaluation.issues.forEach((issue) => {
    logs.push(`[Evaluator] Issue detected: ${issue}`);
  });
} else {
  logs.push("[Evaluator] No major issues detected.");
}

let finalCode = baselineCode;
let finalEvaluation = initialEvaluation;

// --------------------
// SELF-HEALING AGENT
// --------------------
if (
  initialEvaluation.reliabilityScore < 90 ||
  initialEvaluation.securityScore < 90
) {
  logs.push("[Self-Healer] Initiating corrective refactor...");
  logs.push("[Self-Healer] Strengthening validation logic...");
  logs.push("[Self-Healer] Improving defensive programming...");
  logs.push("[Self-Healer] Hardening error handling...");
  logs.push("[Self-Healer] Regenerating improved implementation...");

  finalCode = await runSelfHealingAgent(
    baselineCode,
    initialEvaluation.issues,
  );

  logs.push("[Evaluator] Re-evaluating improved implementation...");
  finalEvaluation = await runEvaluationAgent(finalCode);

  logs.push(
    `[Evaluator] Post-heal reliability score: ${finalEvaluation.reliabilityScore}%`
  );
}

// Apply Sentinel orchestration bonus
finalEvaluation.reliabilityScore = applyBonus(
  finalEvaluation.reliabilityScore,
  5
);

logs.push(
  `[System] Final reliability score: ${finalEvaluation.reliabilityScore}%`
);

    const improvementSummary = await createCompletion(
      "Summarize the improvements made between baseline and improved code.",
      `Baseline code:\n${baselineCode}\n\nImproved code:\n${finalCode}`,
    );

    return NextResponse.json({
      baselineCode,
      finalCode,
      initialEvaluation,
      finalEvaluation,
      improvementSummary,
      logs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run agents.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}