import OpenAI from "openai";
const MODELS = {
  planner: "gpt-4.1",
  builder: "gpt-4.1",
  evaluator: "gpt-4.1",
  selfHealer: "gpt-4.1",
  summary: "gpt-4o",
};

const TEMPERATURE = 0.4;

type PlannerResponse = {
  techStack: string[];
  fileStructure: string[];
  apiRoutes: string[];
  databaseSchema: string;
  securityConsiderations: string[];
  edgeCases: string[];
};

type EvaluationResponse = {
  reliabilityScore: number;
  securityScore: number;
  hallucinationRisk: "low" | "medium" | "high";
  riskBreakdown: {
    validation: string;
    authentication: string;
    secretHandling: string;
    errorHandling: string;
  };
  confidence: {
    planningConfidence: string;
    implementationConfidence: string;
    securityConfidence: string;
  };
  issues: string[];
};

type AgentMode = "raw" | "sentinel" | "improve";

type AgentExecutionInput = {
  mode: AgentMode;
  prompt?: string;
  code?: string;
};

type AgentExecutionResult =
  | {
      mode: "raw";
      baselineCode: string;
      evaluation: EvaluationResponse;
    }
  | {
      mode: "sentinel";
      baselineCode: string;
      finalCode: string;
      initialEvaluation: EvaluationResponse;
      finalEvaluation: EvaluationResponse;
      improvementSummary: string;
    }
  | {
      mode: "improve";
      baselineCode: string;
      finalCode: string;
      initialEvaluation: EvaluationResponse;
      finalEvaluation: EvaluationResponse;
      improvementSummary: string;
    };

type OnLog = (message: string) => void;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your environment variables.");
  }

  return new OpenAI({ apiKey });
}

// Logging is injected so callers can choose their own streaming transport.
function emitLog(onLog: OnLog | undefined, message: string): void {
  try {
    onLog?.(message);
  } catch {
    // A consumer-side logging failure must not interrupt agent execution.
  }
}

function extractJson(content: string): unknown {
  const cleanedContent = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleanedContent);
  } catch {
    throw new Error("Agent returned invalid JSON that could not be parsed.");
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function validatePlannerResponse(data: unknown): PlannerResponse {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Planner response must be a JSON object.");
  }

  const response = data as Record<string, unknown>;

  if (
    !hasExactKeys(response, [
      "techStack",
      "fileStructure",
      "apiRoutes",
      "databaseSchema",
      "securityConsiderations",
      "edgeCases",
    ]) ||
    !isStringArray(response.techStack) ||
    !isStringArray(response.fileStructure) ||
    !isStringArray(response.apiRoutes) ||
    typeof response.databaseSchema !== "string" ||
    !isStringArray(response.securityConsiderations) ||
    !isStringArray(response.edgeCases)
  ) {
    throw new Error("Planner response does not match the required structure.");
  }

  return {
    techStack: response.techStack,
    fileStructure: response.fileStructure,
    apiRoutes: response.apiRoutes,
    databaseSchema: response.databaseSchema,
    securityConsiderations: response.securityConsiderations,
    edgeCases: response.edgeCases,
  };
}

function validateEvaluationResponse(data: unknown): EvaluationResponse {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Evaluation response must be a JSON object.");
  }

  const response = data as Record<string, unknown>;
  const riskBreakdown = response.riskBreakdown;
  const confidence = response.confidence;

  const validScore = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100;

  if (
    !hasExactKeys(response, [
      "reliabilityScore",
      "securityScore",
      "hallucinationRisk",
      "riskBreakdown",
      "confidence",
      "issues",
    ]) ||
    !validScore(response.reliabilityScore) ||
    !validScore(response.securityScore) ||
    (response.hallucinationRisk !== "low" &&
      response.hallucinationRisk !== "medium" &&
      response.hallucinationRisk !== "high") ||
    !riskBreakdown ||
    typeof riskBreakdown !== "object" ||
    Array.isArray(riskBreakdown) ||
    !confidence ||
    typeof confidence !== "object" ||
    Array.isArray(confidence) ||
    !isStringArray(response.issues)
  ) {
    throw new Error("Evaluation response does not match the required structure.");
  }

  const risk = riskBreakdown as Record<string, unknown>;
  const confidenceValues = confidence as Record<string, unknown>;

  if (
    !hasExactKeys(risk, [
      "validation",
      "authentication",
      "secretHandling",
      "errorHandling",
    ]) ||
    typeof risk.validation !== "string" ||
    typeof risk.authentication !== "string" ||
    typeof risk.secretHandling !== "string" ||
    typeof risk.errorHandling !== "string" ||
    !hasExactKeys(confidenceValues, [
      "planningConfidence",
      "implementationConfidence",
      "securityConfidence",
    ]) ||
    typeof confidenceValues.planningConfidence !== "string" ||
    typeof confidenceValues.implementationConfidence !== "string" ||
    typeof confidenceValues.securityConfidence !== "string"
  ) {
    throw new Error("Evaluation response contains invalid nested fields.");
  }

  return {
    reliabilityScore: response.reliabilityScore,
    securityScore: response.securityScore,
    hallucinationRisk: response.hallucinationRisk,
    riskBreakdown: {
      validation: risk.validation,
      authentication: risk.authentication,
      secretHandling: risk.secretHandling,
      errorHandling: risk.errorHandling,
    },
    confidence: {
      planningConfidence: confidenceValues.planningConfidence,
      implementationConfidence: confidenceValues.implementationConfidence,
      securityConfidence: confidenceValues.securityConfidence,
    },
    issues: response.issues,
  };
}

async function createCompletion(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  requireJson: boolean,
): Promise<string>{
  try {
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: TEMPERATURE,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(requireJson ? { response_format: { type: "json_object" } } : {}),
    });

    const content = completion.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("Agent returned an empty response.");
    }

    return content;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenAI completion failed: ${error.message}`);
    }

    throw new Error("OpenAI completion failed.");
  }
}

function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

async function createImprovementSummary(
  baselineCode: string,
  finalCode: string,
  systemPrompt: string,
  onLog?: OnLog,
): Promise<string> {
  emitLog(onLog, "[System] Generating improvement summary...");

 return createCompletion(
  MODELS.summary,
    systemPrompt,
    `Baseline code:\n${baselineCode}\n\nImproved code:\n${finalCode}`,
    false,
  );
}

export async function runPlannerAgent(
  userPrompt: string,
  onLog?: OnLog,
): Promise<PlannerResponse> {
  const prompt = requireText(userPrompt, "A user prompt");

  emitLog(onLog, "[Planner] Generating architecture...");
  const content = await createCompletion(
  MODELS.planner,
    `Create an architecture plan for the user request.
Return only valid JSON with exactly these fields:
{
  "techStack": ["string"],
  "fileStructure": ["string"],
  "apiRoutes": ["string"],
  "databaseSchema": "string",
  "securityConsiderations": ["string"],
  "edgeCases": ["string"]
}
Do not return Markdown, prose, or additional fields.`,
    prompt,
    true,
  );

  const plan = validatePlannerResponse(extractJson(content));
  emitLog(onLog, "[Planner] Architecture generated.");

  return plan;
}

// The Raw builder stays minimal to provide a baseline for comparison.
export async function runRawBuilderAgent(
  userPrompt: string,
  onLog?: OnLog,
): Promise<string> {
  const prompt = requireText(userPrompt, "A user prompt");

  emitLog(onLog, "[Builder] Generating implementation...");
  const code = await createCompletion(
  MODELS.builder,
    "Generate minimal code that implements the user request. Avoid adding validation or defensive enhancements unless explicitly required. Return plain code only. Do not return Markdown fences or explanations.",
    prompt,
    false,
  );

  emitLog(onLog, "[Builder] Implementation generated.");

  return code;
}

// The Sentinel builder enforces stricter constraints for production-oriented code.
export async function runBuilderAgent(
  userPrompt: string,
  plan?: unknown,
  onLog?: OnLog,
): Promise<string> {
  const prompt = requireText(userPrompt, "A user prompt");
  let planDetails = "";

  if (plan !== undefined) {
    try {
      const serializedPlan = JSON.stringify(plan, null, 2);

      if (!serializedPlan) {
        throw new Error("The provided plan could not be converted to JSON.");
      }

      planDetails = `\n\nArchitecture plan:\n${serializedPlan}`;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("The provided plan could not be converted to JSON.");
    }
  }

  emitLog(onLog, "[Builder] Generating implementation...");
  const code = await createCompletion(
  MODELS.builder,
    `Generate backend code that implements the user request and provided plan.
Use only standard, common, or explicitly requested libraries. Do not invent imports, packages, APIs, or dependencies.
Validate external inputs before use. Use safe defaults, null checks, type-safe boundaries, and explicit preconditions.
Handle errors with clear, structured control flow. Do not expose sensitive internal details.
Do not hardcode secrets, API keys, credentials, tokens, or connection strings.
Handle invalid input, missing data, dependency failures, and relevant unexpected states.
Use focused functions, clear responsibilities, and readable names.
Return plain code only. Do not return Markdown fences or explanations.`,
    `User request:\n${prompt}${planDetails}`,
    false,
  );

  emitLog(onLog, "[Builder] Implementation generated.");

  return code;
}

export async function runEvaluationAgent(
  code: string,
  onLog?: OnLog,
): Promise<EvaluationResponse> {
  const sourceCode = requireText(code, "Code");

  emitLog(onLog, "[Evaluator] Running reliability audit...");
  const content = await createCompletion(
  MODELS.evaluator,
    `Review the supplied code for missing validation, hardcoded secrets, security risks, hallucinated imports, and weak error handling.
Return only valid JSON with exactly these lowercase keys:
{
  "reliabilityScore": 0,
  "securityScore": 0,
  "hallucinationRisk": "low",
  "riskBreakdown": {
    "validation": "string",
    "authentication": "string",
    "secretHandling": "string",
    "errorHandling": "string"
  },
  "confidence": {
    "planningConfidence": "string",
    "implementationConfidence": "string",
    "securityConfidence": "string"
  },
  "issues": ["string"]
}
Scores must be numbers from 0 through 100. Do not return Markdown, prose, or additional fields.`,
    sourceCode,
    true,
  );

  const evaluation = validateEvaluationResponse(extractJson(content));
  emitLog(onLog, "[Evaluator] Reliability audit completed.");

  return evaluation;
}

// The Self-Healer performs a full rewrite to resolve all reported issues coherently.
export async function runSelfHealingAgent(
  code: string,
  issues: string[],
  onLog?: OnLog,
): Promise<string> {
  const sourceCode = requireText(code, "Code");

  if (!isStringArray(issues)) {
    throw new Error("Issues must be an array of strings.");
  }

  emitLog(onLog, "[Self-Healer] Refactoring issues...");
  const improvedCode = await createCompletion(
  MODELS.selfHealer,
    `Rewrite the supplied code to resolve every listed issue.
Preserve the intended functionality and externally expected behavior.
Improve structure, clarity, validation, error handling, security, and reliability.
Remove hardcoded secrets and unsafe patterns. Handle relevant edge cases and failure paths.
Use only standard, common, or explicitly requested libraries. Do not invent imports, packages, APIs, or dependencies.
Return plain code only. Do not return Markdown fences or explanations.`,
    `Original code:\n${sourceCode}\n\nIssues to resolve:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    false,
  );

  emitLog(onLog, "[Self-Healer] Refactoring completed.");

  return improvedCode;
}

// This execution layer owns orchestration only; callers own HTTP and streaming transport.
export async function runAgentExecution(
  input: AgentExecutionInput,
  onLog?: OnLog,
): Promise<AgentExecutionResult> {
  try {
    if (!input || typeof input !== "object") {
      throw new Error("Execution input is required.");
    }

    const { mode } = input;

    if (mode !== "raw" && mode !== "sentinel" && mode !== "improve") {
      throw new Error('Mode must be "raw", "sentinel", or "improve".');
    }

    emitLog(onLog, `[System] Starting ${mode} execution.`);

    // RAW MODE
    if (mode === "raw") {
      const prompt = requireText(input.prompt, "A user prompt");

      const baselineCode = await runRawBuilderAgent(prompt, onLog);
      const evaluation = await runEvaluationAgent(baselineCode, onLog);

      evaluation.reliabilityScore = Math.max(
        0,
        evaluation.reliabilityScore - 5,
      );

      emitLog(onLog, "[System] Raw execution completed.");

      return {
        mode: "raw",
        baselineCode,
        evaluation,
      };
    }

    //  IMPROVE MODE
   if (mode === "improve") {
  const baselineCode = requireText(input.code, "Code");

  const initialEvaluation = await runEvaluationAgent(baselineCode, onLog);

  const finalCode = await runSelfHealingAgent(
    baselineCode,
    initialEvaluation.issues,
    onLog,
  );

  emitLog(onLog, "[Evaluator] Re-evaluating improved code...");
  const finalEvaluation = await runEvaluationAgent(finalCode, onLog);

  const improvementSummary = await createImprovementSummary(
    baselineCode,
    finalCode,
    "Summarize the reliability and security improvements made.",
    onLog,
  );

  emitLog(onLog, "[System] Improve execution completed.");

  return {
    mode: "improve",
    baselineCode,
    finalCode,
    initialEvaluation,
    finalEvaluation,
    improvementSummary,
  };
}

    //  SENTINEL MODE
   // ✅ SENTINEL MODE
const prompt = requireText(input.prompt, "A user prompt");

const plan = await runPlannerAgent(prompt, onLog);
const baselineCode = await runBuilderAgent(prompt, plan, onLog);

const initialEvaluation = await runEvaluationAgent(baselineCode, onLog);

let finalCode = baselineCode;
let finalEvaluation = initialEvaluation;

if (
  initialEvaluation.reliabilityScore < 85 ||
  initialEvaluation.securityScore < 85
) {
  finalCode = await runSelfHealingAgent(
    baselineCode,
    initialEvaluation.issues,
    onLog,
  );

  emitLog(onLog, "[Evaluator] Re-evaluating improved code...");
  finalEvaluation = await runEvaluationAgent(finalCode, onLog);
}

const improvementSummary = await createImprovementSummary(
  baselineCode,
  finalCode,
  "Summarize the improvements made between baseline and improved code.",
  onLog,
);

emitLog(onLog, "[System] Sentinel execution completed.");

return {
  mode: "sentinel",
  baselineCode,
  finalCode,
  initialEvaluation,
  finalEvaluation,
  improvementSummary,
};
  } catch (error) {
    emitLog(onLog, "[System] Execution failed.");

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Agent execution failed.");
  }
}