import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { callGeminiWithFallback, GeminiServiceError } from "../_shared/gemini.ts";

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW_IP = 15; // Structuring should be less frequent

// In-memory rate limit store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// In-memory cache for identical submissions
const responseCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL_MS = 300_000; // 5 minutes cache

const checkRateLimit = (key: string, maxRequests: number): { allowed: boolean; remaining: number; resetIn: number } => {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  // Clean up expired entries
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) rateLimitStore.delete(k);
    }
  }
  
  if (!record || record.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: maxRequests - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: record.resetAt - now };
  }
  
  record.count++;
  return { allowed: true, remaining: maxRequests - record.count, resetIn: record.resetAt - now };
};

// Generate cache key
const generateCacheKey = (idea: string): string => {
  const content = idea.toLowerCase().trim().substring(0, 500);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `struct_${hash}`;
};

// Check cache
const getCachedResponse = (key: string): string | null => {
  const cached = responseCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.result;
  }
  if (cached) responseCache.delete(key);
  return null;
};

// Set cache
const setCachedResponse = (key: string, result: string): void => {
  if (responseCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of responseCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) responseCache.delete(k);
    }
  }
  responseCache.set(key, { result, timestamp: Date.now() });
};

// Input validation schema with strict limits
const requestSchema = z.object({
  idea: z.string()
    .min(50, "Idea description must be at least 50 characters")
    .max(5000, "Idea description exceeds 5,000 characters") // Reduced for cost control
}).strict();

// Allowed origins
const ALLOWED_ORIGINS = [
  "https://ideaverdict.in",
  "https://www.ideaverdict.in",
  "https://lovable.dev",
  "https://ideaverdictin.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+-preview--[a-z0-9-]+\.lovable\.app$/,
];

const isOriginAllowed = (origin: string): boolean => {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
};

// Security headers
const getSecurityHeaders = () => ({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
});

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const isAllowed = isOriginAllowed(origin);
  
  return {
    ...getSecurityHeaders(),
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
};

const getClientIP = (req: Request): string => {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
         req.headers.get("x-real-ip") ||
         req.headers.get("cf-connecting-ip") ||
         "unknown";
};

const sanitizeText = (text: string): string => {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
};

// Truncate for cost control
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are Nova, an idea structuring assistant.

Your ONLY job is to take a raw, unstructured idea description and convert it into a clean, structured format.

You do NOT:
- Give verdicts or judgments
- Score ideas
- Provide opinions on viability
- Add hype or discouragement

You DO:
- Extract and clarify the core problem
- Identify the proposed solution
- Define target users clearly
- Articulate differentiation points
- Outline the workflow/mechanism

RESPONSE FORMAT (JSON only):
{
  "problem": "A clear, 2-3 sentence description of the problem being solved",
  "solution": "A concise description of the proposed solution (2-3 sentences)",
  "targetUsers": "Who specifically will use this (be specific about demographics/roles)",
  "differentiation": "What makes this unique compared to existing solutions",
  "workflow": "How the solution works step-by-step in the real world"
}

Guidelines:
- Keep language neutral and practical
- Don't add features the user didn't mention
- Don't assume business models
- Be concise but complete
- If information is missing, make reasonable inferences

IMPORTANT: Return ONLY valid JSON, no markdown, no explanations.`;

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const clientIP = getClientIP(req);
    
    // Rate limiting
    const rateLimit = checkRateLimit(`ip:${clientIP}`, MAX_REQUESTS_PER_WINDOW_IP);
    if (!rateLimit.allowed) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(rateLimit.resetIn / 1000))
          } 
        }
      );
    }

    // Parse and validate request
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    }

    const parseResult = requestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
      console.warn("Validation failed:", errors);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate input for cost control
    const idea = truncateText(sanitizeText(parseResult.data.idea), 3000);
    
    // Check cache first
    const cacheKey = generateCacheKey(idea);
    const cachedResult = getCachedResponse(cacheKey);
    
    if (cachedResult) {
      console.log("Cache hit for structure request");
      return new Response(
        cachedResult,
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-Cache": "HIT"
          } 
        }
      );
    }
    
    console.log("Structure request:", { ideaLength: idea.length, clientIP: clientIP.substring(0, 10) + "..." });

    // Call Gemini API with automatic fallback
    let geminiResponse;
    try {
      geminiResponse = await callGeminiWithFallback({
        prompt: `Structure this idea:\n\n${idea}`,
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.5,
        maxOutputTokens: 1000,
        responseMimeType: "application/json"
      });
      
      if (geminiResponse.usedFallback) {
        console.log("Used fallback API key for structuring");
      }
    } catch (error) {
      if (error instanceof GeminiServiceError) {
        console.error("Gemini service error:", error.message, error.status);
        return new Response(
          JSON.stringify({ error: "AI is temporarily unavailable. Please try again later." }),
          { status: error.status === 429 ? 429 : 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    const content = geminiResponse.content;

    // Parse the JSON response
    let structured;
    try {
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      structured = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse structured idea");
    }

    // Validate and sanitize response fields
    const requiredFields = ["problem", "solution", "targetUsers", "differentiation", "workflow"];
    for (const field of requiredFields) {
      if (!structured[field] || typeof structured[field] !== "string") {
        structured[field] = "";
      } else {
        structured[field] = sanitizeText(structured[field]).substring(0, 2000);
      }
    }

    console.log("Structure complete");

    const responseBody = JSON.stringify({ structured });
    
    // Cache the result
    setCachedResponse(cacheKey, responseBody);

    return new Response(
      responseBody,
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-Cache": "MISS"
        } 
      }
    );
  } catch (error) {
    console.error("Nova error:", error);
    return new Response(
      JSON.stringify({ error: "AI is temporarily unavailable. Please try again later." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
