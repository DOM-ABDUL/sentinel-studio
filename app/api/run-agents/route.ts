import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  runBuilderAgent,
  runEvaluationAgent,
  runPlannerAgent,
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const prompt = body.prompt?.trim();
    const code = body.code?.trim();
    const mode = body.mode;

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
      const initialEvaluation = await runEvaluationAgent(baselineCode);
   const improvedCode = await runSelfHealingAgent(
        baselineCode,
        initialEvaluation.issues,
      );
      const finalEvaluation = await runEvaluationAgent(improvedCode);

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
      });
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "A prompt is required." },
        { status: 400 },
      );
    }

    if (mode === "raw") {
      const baselineCode = await runBuilderAgent(prompt);
      const evaluation = await runEvaluationAgent(baselineCode);

      return NextResponse.json({
        baselineCode,
        evaluation,
      });
    }

    const plan = await runPlannerAgent(prompt);
    const baselineCode = await runBuilderAgent(prompt, plan);
    const initialEvaluation = await runEvaluationAgent(baselineCode);

    let finalCode = baselineCode;
    let finalEvaluation = initialEvaluation;

    if (
      initialEvaluation.reliabilityScore < 85 ||
      initialEvaluation.securityScore < 85
    ) {
      finalCode = await runSelfHealingAgent(
        baselineCode,
        initialEvaluation.issues,
      );
      finalEvaluation = await runEvaluationAgent(finalCode);
    }

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
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run agents.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}