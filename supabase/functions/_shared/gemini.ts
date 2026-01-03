// ============================================================================
// SHARED GEMINI API UTILITY WITH MULTI-KEY FALLBACK
// ============================================================================

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

export interface GeminiError {
  isQuotaExceeded: boolean;
  isRateLimited: boolean;
  message: string;
  status: number;
}

/**
 * Calls Gemini API with automatic fallback to secondary key on 429/quota errors.
 * 
 * Key logic:
 * 1. Try PRIMARY key first
 * 2. On 429/quota error, retry ONCE with SECONDARY key
 * 3. If both fail, return clean error (no provider details exposed)
 */
export async function callGeminiWithFallback(
  request: GeminiRequest
): Promise<GeminiResponse> {
  const primaryKey = Deno.env.get("GEMINI_API_KEY_PRIMARY") || Deno.env.get("GEMINI_API_KEY");
  const secondaryKey = Deno.env.get("GEMINI_API_KEY_SECONDARY");

  if (!primaryKey) {
    console.error("No Gemini API key configured");
    throw new GeminiServiceError("AI service unavailable", 500, false, false);
  }

  // Try primary key first
  try {
    const result = await callGeminiApi(primaryKey, request);
    return { content: result, usedFallback: false };
  } catch (error) {
    if (error instanceof GeminiServiceError && error.isQuotaExceeded && secondaryKey) {
      console.log("Primary key quota exceeded, trying secondary key...");
      
      // Try secondary key
      try {
        const result = await callGeminiApi(secondaryKey, request);
        return { content: result, usedFallback: true };
      } catch (secondaryError) {
        console.error("Secondary key also failed:", secondaryError);
        throw new GeminiServiceError(
          "AI is temporarily unavailable. Please try again later.",
          503,
          false,
          false
        );
      }
    }
    
    // Re-throw non-quota errors
    throw error;
  }
}

/**
 * Makes actual API call to Gemini
 */
async function callGeminiApi(
  apiKey: string,
  request: GeminiRequest
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  
  // Build the prompt
  const fullPrompt = request.systemPrompt 
    ? `${request.systemPrompt}\n\n---\n\n${request.prompt}`
    : request.prompt;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: fullPrompt }]
      }
    ],
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxOutputTokens ?? 1000,
    }
  };

  // Add response MIME type if specified (for JSON output)
  if (request.responseMimeType) {
    (body.generationConfig as Record<string, unknown>).responseMimeType = request.responseMimeType;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini API error (${response.status}):`, errorText);
    
    // Check for quota/rate limit errors
    const isQuotaError = response.status === 429 || 
      errorText.toLowerCase().includes("quota") ||
      errorText.toLowerCase().includes("resource_exhausted");
    
    throw new GeminiServiceError(
      isQuotaError 
        ? "AI is temporarily unavailable. Please try again later." 
        : "AI service error",
      response.status,
      isQuotaError,
      response.status === 429
    );
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new GeminiServiceError("No content received from AI", 500, false, false);
  }

  return content;
}

/**
 * Custom error class for Gemini API errors
 */
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
