import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function extractJson(content: string): unknown {
  const cleanedContent = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleanedContent);
  } catch {
    throw new Error("Agent returned an invalid JSON response.");
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validatePlannerResponse(data: unknown): PlannerResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Planner response must be a JSON object.");
  }

  const response = data as Record<string, unknown>;

  if (
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
  if (!data || typeof data !== "object") {
    throw new Error("Evaluation response must be a JSON object.");
  }

  const response = data as Record<string, unknown>;
  const riskBreakdown = response.riskBreakdown as Record<string, unknown> | undefined;
  const confidence = response.confidence as Record<string, unknown> | undefined;

  const validScore = (score: unknown) =>
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100;

  const validRisk =
    response.hallucinationRisk === "low" ||
    response.hallucinationRisk === "medium" ||
    response.hallucinationRisk === "high";

  if (
    !validScore(response.reliabilityScore) ||
    !validScore(response.securityScore) ||
    !validRisk ||
    !riskBreakdown ||
    typeof riskBreakdown.validation !== "string" ||
    typeof riskBreakdown.authentication !== "string" ||
    typeof riskBreakdown.secretHandling !== "string" ||
    typeof riskBreakdown.errorHandling !== "string" ||
    !confidence ||
    typeof confidence.planningConfidence !== "string" ||
    typeof confidence.implementationConfidence !== "string" ||
    typeof confidence.securityConfidence !== "string" ||
    !isStringArray(response.issues)
  ) {
    throw new Error("Evaluation response does not match the required structure.");
  }

  return {
  reliabilityScore: response.reliabilityScore as number,
  securityScore: response.securityScore as number,
  hallucinationRisk: response.hallucinationRisk as "low" | "medium" | "high",
    riskBreakdown: {
      validation: riskBreakdown.validation,
      authentication: riskBreakdown.authentication,
      secretHandling: riskBreakdown.secretHandling,
      errorHandling: riskBreakdown.errorHandling,
    },
    confidence: {
      planningConfidence: confidence.planningConfidence,
      implementationConfidence: confidence.implementationConfidence,
      securityConfidence: confidence.securityConfidence,
    },
    issues: response.issues,
  };
}

async function createCompletion(
  systemPrompt: string,
  userPrompt: string,
  requireJson = false,
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(requireJson ? { response_format: { type: "json_object" } } : {}),
    });

    const content = completion.choices[0]?.message?.content;

    if (!content || !content.trim()) {
      throw new Error("Agent returned an empty response.");
    }

    return content.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenAI agent request failed: ${error.message}`);
    }

    throw new Error("OpenAI agent request failed.");
  }
}

export async function runPlannerAgent(userPrompt: string): Promise<PlannerResponse> {
  const content = await createCompletion(
    `You are a senior software architect. Create a practical architecture plan based on the user's request.
Return strict JSON only with exactly these fields:
{
  "techStack": ["string"],
  "fileStructure": ["string"],
  "apiRoutes": ["string"],
  "databaseSchema": "string",
  "securityConsiderations": ["string"],
  "edgeCases": ["string"]
}
Do not include markdown, explanations, or extra fields.`,
    userPrompt,
    true,
  );

  return validatePlannerResponse(extractJson(content));
}

export async function runBuilderAgent(
  userPrompt: string,
  plan: any,
): Promise<string> {
  if (!userPrompt.trim()) {
    throw new Error("A user prompt is required to run the builder agent.");
  }

  const content = await createCompletion(
    `You are a backend engineer. Implement the planned architecture as production-ready backend code.
Use only common, explicitly requested, or standard project libraries. Do not invent imports or dependencies.
Include input validation, meaningful error handling, and secure defaults.
Return plain code only, without markdown fences or explanations.`,
    `User request:\n${userPrompt}\n\nArchitecture plan:\n${JSON.stringify(plan, null, 2)}`,
  );

  if (!content.trim()) {
    throw new Error("Builder agent did not return valid code.");
  }

  return content;
}

export async function runEvaluationAgent(code: string): Promise<EvaluationResponse> {
  if (!code.trim()) {
    throw new Error("Code is required to run the evaluation agent.");
  }

  const content = await createCompletion(
    `You are a security and reliability reviewer. Analyze the provided code for missing validation, hardcoded secrets, security risks, hallucinated imports, and weak error handling.
Return strict JSON only with exactly this structure:
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
Scores must be numbers from 0 to 100. Do not include markdown or extra fields.`,
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
    throw new Error("Code is required to run the self-healing agent.");
  }

  if (!isStringArray(issues)) {
    throw new Error("Issues must be an array of strings.");
  }

  const content = await createCompletion(
    `You are a senior backend engineer. Fix the listed issues in the provided code while preserving its intended behavior.
Improve validation, reliability, security, and error handling where appropriate.
Do not introduce unverified libraries or hallucinated imports.
Return improved code only, without markdown fences or explanations.`,
    `Code:\n${code}\n\nIssues to fix:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
  );

  if (!content.trim()) {
    throw new Error("Self-healing agent did not return valid code.");
  }

  return content;
}