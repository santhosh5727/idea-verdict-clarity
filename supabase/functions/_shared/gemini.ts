// ============================================================================
// SHARED GEMINI API UTILITY WITH MULTI-KEY FALLBACK & QUOTA-AWARE GUARD
// ============================================================================

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Quota cooldown configuration (MVP: 45 minutes cooldown after quota exhaustion)
const QUOTA_COOLDOWN_MS = 45 * 60 * 1000; // 45 minutes

// In-memory quota exhaustion state (resets on cold start, which is fine for MVP)
interface QuotaState {
  exhaustedAt: number;
  bothKeysExhausted: boolean;
}
let quotaState: QuotaState | null = null;

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
 * Check if we're in quota cooldown period
 * Returns remaining cooldown time in ms, or 0 if not in cooldown
 */
export function getQuotaCooldownRemaining(): number {
  if (!quotaState || !quotaState.bothKeysExhausted) {
    return 0;
  }
  
  const elapsed = Date.now() - quotaState.exhaustedAt;
  const remaining = QUOTA_COOLDOWN_MS - elapsed;
  
  if (remaining <= 0) {
    // Cooldown expired, reset state
    quotaState = null;
    console.log("Quota cooldown expired, allowing new requests");
    return 0;
  }
  
  return remaining;
}

/**
 * Check if AI is available (not in quota cooldown)
 */
export function isAIAvailable(): boolean {
  return getQuotaCooldownRemaining() === 0;
}

/**
 * Mark both keys as quota exhausted, starting cooldown period
 */
function markQuotaExhausted(): void {
  quotaState = {
    exhaustedAt: Date.now(),
    bothKeysExhausted: true
  };
  console.log(`Both API keys exhausted. Cooldown for ${QUOTA_COOLDOWN_MS / 60000} minutes`);
}

/**
 * Calls Gemini API with automatic fallback to secondary key on 429/quota errors.
 * 
 * Key logic:
 * 1. Check quota cooldown first - block if in cooldown
 * 2. Try PRIMARY key first
 * 3. On 429/quota error, retry ONCE with SECONDARY key
 * 4. If both fail, enter cooldown period and return clean error
 */
export async function callGeminiWithFallback(
  request: GeminiRequest
): Promise<GeminiResponse> {
  // QUOTA-AWARE GUARD: Check if we're in cooldown period
  const cooldownRemaining = getQuotaCooldownRemaining();
  if (cooldownRemaining > 0) {
    const minutesRemaining = Math.ceil(cooldownRemaining / 60000);
    console.log(`AI blocked - quota cooldown active (${minutesRemaining} min remaining)`);
    throw new GeminiServiceError(
      "AI is temporarily unavailable. Please try again later.",
      503,
      true, // Treat as quota exceeded for frontend handling
      false
    );
  }

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
        
        // Both keys exhausted - enter cooldown period
        markQuotaExhausted();
        
        throw new GeminiServiceError(
          "AI is temporarily unavailable. Please try again later.",
          503,
          true,
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
