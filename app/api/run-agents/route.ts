export const runtime = "nodejs";
import { runAgentExecution } from "@/lib/agents";

type RequestBody = {
  prompt?: string;
  code?: string;
  mode?: "raw" | "sentinel" | "improve";
};

type AgentInput = {
  prompt?: string;
  code?: string;
  mode: "raw" | "sentinel" | "improve";
};

type StreamMessage =
  | { type: "log"; message: string }
  | { type: "complete"; payload: unknown }
  | { type: "error"; message: string };

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function validateRequestBody(body: unknown): AgentInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Request body must be a JSON object.");
  }

  const { prompt, code, mode } = body as RequestBody;

  if (mode !== "raw" && mode !== "sentinel" && mode !== "improve") {
    throw new RequestValidationError(
      'Mode must be "raw", "sentinel", or "improve".',
    );
  }

  if (mode === "improve") {
    if (typeof code !== "string" || !code.trim()) {
      throw new RequestValidationError("Code is required for improve mode.");
    }

    return {
      mode,
      code: code.trim(),
    };
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new RequestValidationError("A prompt is required.");
  }

  return {
    mode,
    prompt: prompt.trim(),
  };
}

function createErrorResponse(message: string, status: number): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `${JSON.stringify({
            type: "log",
            message: "[System] Execution failed.",
          } satisfies StreamMessage)}\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `${JSON.stringify({
            type: "error",
            message,
          } satisfies StreamMessage)}\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(request: Request) {
  let input: AgentInput;

  try {
    const body = await request.json();
    input = validateRequestBody(body);
  } catch (error) {
    console.error("AGENT EXECUTION ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Invalid request body.";

    return createErrorResponse(message, 400);
  }

  let cancelled = false;

  // The execution layer emits status events through onLog; this route immediately
  // serializes each event as newline-delimited JSON without storing log history.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (message: StreamMessage) => {
        if (cancelled) {
          return;
        }

        try {
          controller.enqueue(
            encoder.encode(`${JSON.stringify(message)}\n`),
          );
        } catch {
          cancelled = true;
        }
      };

      try {
        const result = await runAgentExecution(input, (message) => {
          send({ type: "log", message });
        });

        send({
          type: "complete",
          payload: result,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to run agents.";

        send({
          type: "log",
          message: "[System] Execution failed.",
        });
        send({
          type: "error",
          message,
        });
      } finally {
        if (!cancelled) {
          controller.close();
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}