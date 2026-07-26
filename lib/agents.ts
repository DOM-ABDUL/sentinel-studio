import "dotenv/config";
import OpenAI from "openai";



const MODEL = "gpt-4o-mini";
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

function getOpenAI(): OpenAI {
  console.log("ENV KEY:", process.env.OPENAI_API_KEY);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your environment variables.");
  }

  return new OpenAI({ apiKey });
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
  systemPrompt: string,
  userPrompt: string,
  requireJson: boolean,
): Promise<string> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
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
  }    catch (error) {
  if (error instanceof Error) {
    throw new Error(`OpenAI completion failed: ${error.message}`);
  }

  throw new Error("OpenAI completion failed.");
}
}


export async function runPlannerAgent(
  userPrompt: string,
): Promise<PlannerResponse> {
  if (!userPrompt.trim()) {
    throw new Error("A user prompt is required for the planner agent.");
  }

  const content = await createCompletion(
    `You are a senior software architect. Create a practical architecture plan.
Return strict JSON only with exactly these fields:
{
  "techStack": ["string"],
  "fileStructure": ["string"],
  "apiRoutes": ["string"],
  "databaseSchema": "string",
  "securityConsiderations": ["string"],
  "edgeCases": ["string"]
}
Do not include markdown, explanations, or additional fields.`,
    userPrompt,
    true,
  );

  return validatePlannerResponse(extractJson(content));
}

export async function runBuilderAgent(
  userPrompt: string,
  plan?: unknown,
): Promise<string> {
  if (!userPrompt.trim()) {
    throw new Error("A user prompt is required for the builder agent.");
  }

  let planDetails = "";

  if (plan !== undefined) {
    try {
      planDetails = `\n\nArchitecture plan:\n${JSON.stringify(plan, null, 2)}`;
    } catch {
      throw new Error("The provided plan could not be converted to JSON.");
    }
  }

  return createCompletion(
    `You are a backend engineer. Produce production-ready backend code.
Use only standard, common, or explicitly requested libraries. Do not invent imports or dependencies.
Include input validation and meaningful error handling. Return plain code only, with no markdown fences or explanations.`,
    `User request:\n${userPrompt}${planDetails}`,
    false,
  );
}

export async function runEvaluationAgent(
  code: string,
): Promise<EvaluationResponse> {
  if (!code.trim()) {
    throw new Error("Code is required for the evaluation agent.");
  }

  const content = await createCompletion(
    `You are a security and reliability reviewer. Analyze the supplied code for missing validation, hardcoded secrets, security risks, hallucinated imports, and weak error handling.
Return strict JSON only with exactly these lowercase keys:
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
Scores must be numbers from 0 through 100. Do not include markdown, explanations, or additional fields.`,
    code,
    true,
  );

  return validateEvaluationResponse(extractJson(content));
}

export async function runSelfHealingAgent(
  code: string,
  issues: string[],
): Promise<string> {
  if (!code.trim()) {
    throw new Error("Code is required for the self-healing agent.");
  }

  if (!isStringArray(issues)) {
    throw new Error("Issues must be an array of strings.");
  }

  return createCompletion(
    `You are a senior backend engineer. Fix the listed issues while preserving the code's intended behavior.
Improve validation, reliability, security, and error handling where appropriate.
Do not introduce unverified libraries or hallucinated imports.
Return improved plain code only, with no markdown fences or explanations.`,
    `Code:\n${code}\n\nIssues to fix:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    false,
  );
}