import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW_IP = 30; // Chat can be more frequent

// In-memory rate limit store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

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

// Input validation schema
const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(5000)
});

const requestSchema = z.object({
  message: z.string().max(2000).optional(),
  verdict_text: z.string().max(50000).optional(),
  verdict: z.string().max(50000).optional(),
  verdict_type: z.string().max(50).optional(),
  verdictType: z.string().max(50).optional(),
  idea_problem: z.string().max(15000).optional(),
  conversationHistory: z.array(conversationMessageSchema).max(50).optional(),
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

// Security headers for all responses (OWASP best practices)
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

// ============================================================================
// PROMPT BUILDER
// ============================================================================

const buildSystemPrompt = (
  ideaProblem: string,
  verdictType: string,
  score: string,
  fullEvaluation: string
) => {
  return `You are a friendly Verdict Assistant helping users understand their startup idea evaluation.

CONTEXT - THE IDEA BEING EVALUATED:
"${ideaProblem}"

VERDICT RESULT: ${verdictType}
IDEA STRENGTH SCORE: ${score}%

FULL EVALUATION:
${fullEvaluation}

YOUR ROLE:
- Answer questions about this specific evaluation conversationally and helpfully
- Reference specific parts of the evaluation when relevant
- Quote actual reasoning from the evaluation to back up your points
- Be conversational, not robotic - use a friendly, helpful tone
- Ask clarifying questions when needed
- Keep responses concise (2-3 paragraphs max)

STRICT RULES:
- NEVER suggest new ideas or pivots
- NEVER do re-evaluations or give new scores
- NEVER change or challenge the verdict
- ONLY discuss and explain the existing evaluation
- If asked to re-score or change verdict, politely explain the verdict is final and offer to clarify it instead

Remember: Be helpful and conversational, like a knowledgeable friend explaining the evaluation.`;
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
    
    const message = sanitizeText(body.message || "");
    const verdictText = body.verdict_text || body.verdict || "";
    const verdictType = body.verdict_type || body.verdictType || "UNKNOWN";
    const ideaProblem = sanitizeText(body.idea_problem || "");
    const conversationHistory = body.conversationHistory || [];
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Chat unavailable. Please try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const score = parseScoreFromEvaluation(verdictText);
    const systemPrompt = buildSystemPrompt(ideaProblem, verdictType, score, verdictText);

    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];
    
    // Add sanitized conversation history
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        if (msg.role && msg.content) {
          messages.push({ 
            role: msg.role, 
            content: sanitizeText(msg.content).substring(0, 5000) 
          });
        }
      }
    }

    if (isFirstMessage) {
      const verdictLabel = verdictType === "build" ? "BUILD" : 
                          verdictType === "narrow" ? "NARROW" : "DO NOT BUILD";
      messages.push({ 
        role: "user", 
        content: `Generate a brief, friendly greeting introducing yourself and the evaluation result. The verdict is ${verdictLabel} with a score of ${score}%. Invite them to ask questions. Keep it to 2-3 sentences.` 
      });
    } else {
      if (message.length < 3) {
        return new Response(
          JSON.stringify({ response: "Please ask a more detailed question (at least 3 characters)." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      messages.push({ role: "user", content: message.substring(0, 2000) });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Chat unavailable. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const assistantResponse = data.choices?.[0]?.message?.content;

    if (!assistantResponse) {
      return new Response(
        JSON.stringify({ error: "Chat unavailable. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ response: assistantResponse }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining)
        } 
      }
    );
  } catch (error) {
    console.error("Error in verdict-assistant:", error);
    return new Response(
      JSON.stringify({ error: "Chat unavailable. Please try again." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
