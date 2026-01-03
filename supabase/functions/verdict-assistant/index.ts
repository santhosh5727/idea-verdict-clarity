import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { callGeminiWithFallback, GeminiServiceError } from "../_shared/gemini.ts";

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW_IP = 30; // Chat can be more frequent

// In-memory rate limit store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Simple response cache for repeated questions
const responseCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL_MS = 180_000; // 3 minutes cache for chat

const checkRateLimit = (key: string, maxRequests: number): { allowed: boolean; remaining: number; resetIn: number } => {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
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

// Generate cache key for chat
const generateCacheKey = (message: string, verdictType: string): string => {
  const content = `${message}|${verdictType}`.toLowerCase().trim().substring(0, 200);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `chat_${hash}`;
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
  if (responseCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of responseCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) responseCache.delete(k);
    }
  }
  responseCache.set(key, { result, timestamp: Date.now() });
};

// Input validation schema
const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000) // Reduced for cost control
});

const requestSchema = z.object({
  message: z.string().max(1000).optional(), // Reduced for cost control
  verdict_text: z.string().max(20000).optional(), // Reduced
  verdict: z.string().max(20000).optional(),
  verdict_type: z.string().max(50).optional(),
  verdictType: z.string().max(50).optional(),
  idea_problem: z.string().max(5000).optional(), // Reduced
  conversationHistory: z.array(conversationMessageSchema).max(20).optional(), // Reduced
  isFirstMessage: z.boolean().optional()
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
// PROMPT BUILDER
// ============================================================================

const buildSystemPrompt = (
  ideaProblem: string,
  verdictType: string,
  score: string,
  fullEvaluation: string
) => {
  // Truncate evaluation for cost control
  const truncatedEval = truncateText(fullEvaluation, 3000);
  
  return `You are a friendly Verdict Assistant helping users understand their startup idea evaluation.

CONTEXT - THE IDEA:
"${truncateText(ideaProblem, 500)}"

VERDICT: ${verdictType}
SCORE: ${score}%

EVALUATION SUMMARY:
${truncatedEval}

YOUR ROLE:
- Answer questions about this evaluation conversationally
- Reference specific parts of the evaluation when relevant
- Be friendly and helpful, not robotic
- Keep responses concise (2-3 paragraphs max)

STRICT RULES:
- NEVER suggest new ideas or pivots
- NEVER re-evaluate or give new scores
- NEVER change or challenge the verdict
- ONLY discuss and explain the existing evaluation
- If asked to re-score, politely explain the verdict is final`;
};

const parseScoreFromEvaluation = (fullEvaluation: string): string => {
  const patterns = [
    /idea\s*strength[:\s]*(\d+)%/i,
    /viability\s*score[:\s]*(\d+)%?/i,
    /score[:\s]*(\d+)%/i,
    /(\d+)%\s*(?:idea\s*)?strength/i,
  ];
  
  for (const pattern of patterns) {
    const match = fullEvaluation.match(pattern);
    if (match) return match[1];
  }
  return "N/A";
};

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

    const body = parseResult.data;
    
    const message = truncateText(sanitizeText(body.message || ""), 500);
    const verdictText = truncateText(body.verdict_text || body.verdict || "", 5000);
    const verdictType = body.verdict_type || body.verdictType || "UNKNOWN";
    const ideaProblem = truncateText(sanitizeText(body.idea_problem || ""), 1000);
    const conversationHistory = (body.conversationHistory || []).slice(-10); // Keep only last 10 messages
    const isFirstMessage = body.isFirstMessage || false;

    console.log("Chat request:", { 
      messageLength: message.length,
      hasVerdictText: !!verdictText,
      historyLength: conversationHistory.length,
      isFirstMessage 
    });

    // Validate verdict exists
    if (!verdictText) {
      return new Response(
        JSON.stringify({ response: "I don't have the verdict context. Please refresh the page and try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache for non-first messages
    if (!isFirstMessage && message) {
      const cacheKey = generateCacheKey(message, verdictType);
      const cachedResult = getCachedResponse(cacheKey);
      if (cachedResult) {
        console.log("Cache hit for chat");
        return new Response(
          JSON.stringify({ response: cachedResult }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } }
        );
      }
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY_PRIMARY") || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI is temporarily unavailable. Please try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const score = parseScoreFromEvaluation(verdictText);
    const systemPrompt = buildSystemPrompt(ideaProblem, verdictType, score, verdictText);

    // Build conversation for Gemini
    let conversationText = "";
    
    // Add history (limited)
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-5)) { // Only last 5 messages for cost control
        if (msg.role && msg.content) {
          const role = msg.role === "user" ? "User" : "Assistant";
          conversationText += `${role}: ${truncateText(sanitizeText(msg.content), 500)}\n\n`;
        }
      }
    }

    let userMessage: string;
    if (isFirstMessage) {
      const verdictLabel = verdictType === "build" ? "BUILD" : 
                          verdictType === "narrow" ? "NARROW" : "DO NOT BUILD";
      userMessage = `Generate a brief, friendly greeting introducing yourself and the evaluation result. The verdict is ${verdictLabel} with a score of ${score}%. Invite them to ask questions. Keep it to 2-3 sentences.`;
    } else {
      if (message.length < 3) {
        return new Response(
          JSON.stringify({ response: "Please ask a more detailed question (at least 3 characters)." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userMessage = message;
    }

    // Call Gemini API with automatic fallback
    let geminiResponse;
    try {
      geminiResponse = await callGeminiWithFallback({
        prompt: `Conversation so far:\n${conversationText}\n\nUser: ${userMessage}`,
        systemPrompt: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 500
      });
      
      if (geminiResponse.usedFallback) {
        console.log("Used fallback API key for chat");
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

    const assistantResponse = geminiResponse.content;

    // Cache the response (only for non-first messages)
    if (!isFirstMessage && message) {
      const cacheKey = generateCacheKey(message, verdictType);
      setCachedResponse(cacheKey, assistantResponse);
    }

    return new Response(
      JSON.stringify({ response: assistantResponse }),
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
    console.error("Error in verdict-assistant:", error);
    return new Response(
      JSON.stringify({ error: "AI is temporarily unavailable. Please try again later." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
