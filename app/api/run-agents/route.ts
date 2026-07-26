import { NextResponse } from "next/server";
import {
  runBuilderAgent,
  runEvaluationAgent,
  runPlannerAgent,
  runSelfHealingAgent,
} from "@/lib/agents";

type RequestBody = {
  prompt?: string;
  mode?: "raw" | "sentinel";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const prompt = body.prompt?.trim();
    const mode = body.mode;

    if (!prompt) {
      return NextResponse.json(
        { error: "A prompt is required." },
        { status: 400 },
      );
    }

    if (mode !== "raw" && mode !== "sentinel") {
      return NextResponse.json(
        { error: 'Mode must be either "raw" or "sentinel".' },
        { status: 400 },
      );
    }

    if (mode === "raw") {
      const code = await runBuilderAgent(prompt, undefined);;
      const evaluation = await runEvaluationAgent(code);

      return NextResponse.json({ evaluation });
    }

    const plan = await runPlannerAgent(prompt);
    const code = await runBuilderAgent(prompt, plan);
    const initialEvaluation = await runEvaluationAgent(code);

    let finalEvaluation = initialEvaluation;

    if (
  initialEvaluation.reliabilityScore < 85 ||
  initialEvaluation.securityScore < 85
) {
      const improvedCode = await runSelfHealingAgent(
        code,
        initialEvaluation.issues,
      );

      finalEvaluation = await runEvaluationAgent(improvedCode);
    }

    return NextResponse.json({
      initialEvaluation,
      finalEvaluation,
    });
  } catch (error) {
  console.error("==== AGENT ERROR START ====");
  console.error(error);
  console.error("==== AGENT ERROR END ====");

  const message =
    error instanceof Error ? error.message : "Unable to run agents.";

  return NextResponse.json({ error: message }, { status: 500 });
}
}