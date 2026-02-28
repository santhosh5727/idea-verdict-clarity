// ============================================================================
// SHARED AI UTILITY - LOVABLE AI GATEWAY (google/gemini-3-flash-preview)
// ============================================================================

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

export interface GeminiRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

export interface GeminiResponse {
  content: string;
  usedFallback: boolean;
}

export class GeminiServiceError extends Error {
  public readonly status: number;
  public readonly isQuotaExceeded: boolean;
  public readonly isRateLimited: boolean;

  constructor(
    message: string,
    status: number,
    isQuotaExceeded: boolean,
    isRateLimited: boolean
  ) {
    super(message);
    this.name = "GeminiServiceError";
    this.status = status;
    this.isQuotaExceeded = isQuotaExceeded;
    this.isRateLimited = isRateLimited;
  }
}

/** No longer needed with Lovable AI Gateway - always available */
export function getQuotaCooldownRemaining(): number {
  return 0;
}

/** Always available with Lovable AI Gateway */
export function isAIAvailable(): boolean {
  return true;
}

/**
 * Calls AI via Lovable AI Gateway (OpenAI-compatible API).
 * Uses google/gemini-3-flash-preview model.
 */
export async function callGeminiWithFallback(
  request: GeminiRequest
): Promise<GeminiResponse> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("LOVABLE_API_KEY is not configured");
    throw new GeminiServiceError("AI service unavailable", 500, false, false);
  }

  const messages: { role: string; content: string }[] = [];

  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }

  messages.push({ role: "user", content: request.prompt });

  const body: Record<string, unknown> = {
    model: AI_MODEL,
    messages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxOutputTokens ?? 1000,
  };

  // For JSON output, add instruction to system prompt
  if (request.responseMimeType === "application/json") {
    const systemIdx = messages.findIndex(m => m.role === "system");
    if (systemIdx >= 0) {
      messages[systemIdx].content += "\n\nIMPORTANT: Return ONLY valid JSON, no markdown.";
    }
  }

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI Gateway error (${response.status}):`, errorText);

    if (response.status === 429) {
      throw new GeminiServiceError(
        "Rate limit exceeded. Please try again later.",
        429, false, true
      );
    }
    if (response.status === 402) {
      throw new GeminiServiceError(
        "AI credits exhausted. Please try again later.",
        402, true, false
      );
    }

    throw new GeminiServiceError(
      "AI service error",
      response.status,
      false,
      false
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new GeminiServiceError("No content received from AI", 500, false, false);
  }

  return { content, usedFallback: false };
}
