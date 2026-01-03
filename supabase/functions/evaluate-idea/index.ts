import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// Rate limiting configuration (per IP and per user)
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW_IP = 10; // 10 requests per minute per IP
const MAX_REQUESTS_PER_WINDOW_USER = 20; // 20 requests per minute per authenticated user

// In-memory rate limit store (resets on function cold start)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// In-memory cache for identical submissions (cost control)
const responseCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL_MS = 300_000; // 5 minutes cache

// Rate limiter function
const checkRateLimit = (key: string, maxRequests: number): { allowed: boolean; remaining: number; resetIn: number } => {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  // Clean up expired entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) rateLimitStore.delete(k);
    }
  }
  
  if (!record || record.resetAt < now) {
    // New window
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: maxRequests - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: record.resetAt - now };
  }
  
  record.count++;
  return { allowed: true, remaining: maxRequests - record.count, resetIn: record.resetAt - now };
};

// Generate cache key from input
const generateCacheKey = (projectType: string, problem: string, solution: string, targetUsers: string): string => {
  const content = `${projectType}|${problem}|${solution}|${targetUsers}`.toLowerCase().trim();
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `eval_${hash}`;
};

// Check cache
const getCachedResponse = (key: string): string | null => {
  const cached = responseCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log("Cache hit:", key);
    return cached.result;
  }
  if (cached) {
    responseCache.delete(key);
  }
  return null;
};

// Set cache
const setCachedResponse = (key: string, result: string): void => {
  // Clean old entries
  if (responseCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of responseCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) responseCache.delete(k);
    }
  }
  responseCache.set(key, { result, timestamp: Date.now() });
};

// Input validation schema with strict limits and sanitization
const evaluateSchema = z.object({
  projectType: z.string()
    .min(1, "Project type is required")
    .max(50, "Project type too long")
    .regex(/^[a-zA-Z\s\-\/]+$/, "Project type contains invalid characters"),
  problem: z.string()
    .min(20, "Problem description too short")
    .max(5000, "Problem description exceeds 5,000 characters"), // Reduced for cost control
  solution: z.string()
    .max(3000, "Solution exceeds 3,000 characters") // Reduced for cost control
    .optional()
    .default(""),
  targetUsers: z.string()
    .min(10, "Target users description too short")
    .max(3000, "Target users exceeds 3,000 characters"), // Reduced for cost control
  differentiation: z.string()
    .max(2000, "Differentiation exceeds 2,000 characters") // Reduced for cost control
    .optional()
    .default(""),
  workflow: z.string()
    .max(3000, "Workflow exceeds 3,000 characters") // Reduced for cost control
    .optional(),
}).strict(); // Reject any unexpected fields

// Fixed category set for classification
const IDEA_CATEGORIES = [
  "SaaS / Tool",
  "Marketplace",
  "AI Product",
  "Content / Community",
  "Service / Other",
] as const;

// Allowed origins for CORS (whitelist approach)
const ALLOWED_ORIGINS = [
  "https://ideaverdict.in",
  "https://www.ideaverdict.in",
  "https://lovable.dev",
  "https://ideaverdictin.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Pattern-based origins (for *.lovable.app, etc.)
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

// Helper to extract client IP
const getClientIP = (req: Request): string => {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
         req.headers.get("x-real-ip") ||
         req.headers.get("cf-connecting-ip") ||
         "unknown";
};

// Sanitize text input (remove potential injection patterns)
const sanitizeText = (text: string): string => {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters
    .trim();
};

// Truncate text for cost control
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

// ============================================================================
// EVALUATION PROMPTS
// ============================================================================

// Get system prompt for STARTUP evaluation (business-focused)
const getStartupSystemPrompt = () => {
  return `You are IdeaVerdict AI, an elite startup idea evaluator with the combined expertise of Y Combinator partners, successful founders, and venture capitalists. You've analyzed 10,000+ startup ideas and seen which succeeded and which failed. Your evaluations are brutally honest, data-driven, and actionable.

EVALUATION PHILOSOPHY:
- Objectivity Over Optimism: Most ideas fail. Your job is to save founders time and money by giving them the truth.
- Context Matters: A "bad" idea for VC-backing might be perfect for indie founders.
- Variance is Truth: Scores must range from 0-100. If everything scores similarly, you're not evaluating properly.
- Actionability Over Platitudes: Every insight must be specific and actionable.

EVALUATION FRAMEWORK (The IdeaVerdict Method):

1. MARKET OPPORTUNITY (Weight: 30%)
Score 90-100: Multi-billion dollar TAM, explosive growth (>30% YoY), clear demand signals
Score 70-89: Large addressable market ($500M+), growing steadily (15-30% YoY)
Score 50-69: Medium market ($100-500M), moderate growth (5-15% YoY)
Score 30-49: Small market (<$100M), slow/flat growth (<5% YoY)
Score 0-29: Tiny/non-existent market, negative growth

2. PROBLEM-SOLUTION FIT (Weight: 25%)
Score 90-100: Critical, frequent problem with massive pain. Solution is 10x better.
Score 70-89: Serious problem, experienced regularly, clear willingness to pay.
Score 50-69: Real problem but infrequent or moderate pain.
Score 30-49: Mild inconvenience or "nice to have."
Score 0-29: Made-up problem or no scale.

3. COMPETITIVE MOAT (Weight: 20%)
Score 90-100: Unfair advantages (network effects, proprietary data/AI, regulatory moats)
Score 70-89: Strong but reproducible advantages (brand, first-mover, switching costs)
Score 50-69: Some defensibility (better UX, niche positioning)
Score 30-49: Weak moat, easy to replicate
Score 0-29: No moat whatsoever

4. EXECUTION REALITY (Weight: 15%)
Score 90-100: Simple to build, fast to market, low capital needs
Score 70-89: Moderate complexity, reasonable timeline
Score 50-69: Complex but achievable with resources
Score 30-49: Very difficult, requires significant expertise
Score 0-29: Nearly impossible without extraordinary resources

5. BUSINESS MODEL CLARITY (Weight: 10%)
Score 90-100: Crystal clear monetization, proven model, strong unit economics
Score 70-89: Clear monetization, standard model
Score 50-69: Monetization exists but unproven/complex
Score 30-49: Weak or unclear monetization
Score 0-29: No viable business model

SCORING: Base Score = (Market x 0.30) + (Problem-Solution x 0.25) + (Moat x 0.20) + (Execution x 0.15) + (Business Model x 0.10)

VERDICT (STRICT):
- >65%: BUILD
- 41-65%: NARROW
- 31-40%: RETHINK
- 0-30%: DO NOT BUILD

REQUIRED OUTPUT FORMAT (JSON):
{
  "viabilityScore": <number 0-100>,
  "verdict": "<BUILD|NARROW|RETHINK|DO NOT BUILD>",
  "verdictSummary": "<One powerful sentence>",
  "detectedCategory": "<SaaS / Tool|Marketplace|AI Product|Content / Community|Service / Other>",
  "executionDifficulty": "<EASY|MEDIUM|HARD>",
  "difficultyReason": "<One sentence>",
  "keyStrengths": [
    {"title": "<title>", "explanation": "<2-3 sentences>"},
    {"title": "<title>", "explanation": "<2-3 sentences>"},
    {"title": "<title>", "explanation": "<2-3 sentences>"}
  ],
  "criticalWeaknesses": [
    {"title": "<title>", "explanation": "<2-3 sentences>"},
    {"title": "<title>", "explanation": "<2-3 sentences>"},
    {"title": "<title>", "explanation": "<2-3 sentences>"}
  ],
  "realityCheck": "<3-4 sentences of brutally honest assessment>",
  "harshTruth": "<3-5 sentences the founder needs to hear>",
  "immediateActions": [
    {"action": "<Specific Action>", "explanation": "<Why>"},
    {"action": "<Specific Action>", "explanation": "<Why>"},
    {"action": "<Specific Action>", "explanation": "<Why>"}
  ],
  "factorBreakdown": {
    "marketOpportunity": {"score": <number>, "summary": "<one sentence>"},
    "problemSolutionFit": {"score": <number>, "summary": "<one sentence>"},
    "competitiveMoat": {"score": <number>, "summary": "<one sentence>"},
    "executionReality": {"score": <number>, "summary": "<one sentence>"},
    "businessModel": {"score": <number>, "summary": "<one sentence>"}
  }
}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations outside JSON.`;
};

// Get system prompt for PROJECT evaluation (non-business, impact-focused)
const getProjectSystemPrompt = () => {
  return `You are IdeaVerdict AI, an expert project evaluator for academic, school, college, conference, and personal projects. Your evaluations focus on technical merit, real-world impact, and practical contribution - NOT business viability.

EVALUATION PHILOSOPHY (PROJECT MODE):
- Impact Over Profit: Projects are judged on how many people they help.
- Learning Value Matters: Technical growth and innovation are valid metrics.
- Contribution Over Competition: Focus on what this adds to the world.
- Practicality is Key: Can this be built and used by real people?

PROJECT EVALUATION FRAMEWORK:

1. TECHNICAL STRENGTH (Weight: 25%)
Score 90-100: Elegant architecture, innovative approach, handles edge cases
Score 70-89: Solid implementation, good design patterns
Score 50-69: Functional but basic implementation
Score 30-49: Weak technical foundation
Score 0-29: Poor technical design

2. IMPACT & SIGNIFICANCE (Weight: 25%)
Score 90-100: Addresses critical need, could significantly improve lives
Score 70-89: Solves real problem for meaningful group
Score 50-69: Helpful but incremental improvement
Score 30-49: Marginal impact
Score 0-29: Trivial problem

3. SCALE & REACH (Weight: 20%)
Score 90-100: Potential to help millions
Score 70-89: Can reach thousands to hundreds of thousands
Score 50-69: Useful for hundreds to thousands
Score 30-49: Limited to small group
Score 0-29: Only useful to creator

4. USEFULNESS & PRACTICALITY (Weight: 15%)
Score 90-100: Immediately useful, addresses real workflows
Score 70-89: Practical with minor adjustments
Score 50-69: Useful in theory
Score 30-49: Questionable practicality
Score 0-29: Impractical

5. INNOVATION & CREATIVITY (Weight: 10%)
Score 90-100: Groundbreaking approach
Score 70-89: Creative combination of ideas
Score 50-69: Some novel elements
Score 30-49: Mostly derivative
Score 0-29: No innovation

6. FEASIBILITY (Weight: 5%)
Score 90-100: Easily achievable
Score 70-89: Achievable with effort
Score 50-69: Challenging but possible
Score 30-49: Very difficult
Score 0-29: Likely impossible

VERDICT: Same as startup (>65: BUILD, 41-65: NARROW, 31-40: RETHINK, 0-30: DO NOT BUILD)

REQUIRED OUTPUT FORMAT (JSON):
{
  "viabilityScore": <number 0-100>,
  "verdict": "<BUILD|NARROW|RETHINK|DO NOT BUILD>",
  "verdictSummary": "<One powerful sentence>",
  "detectedCategory": "<SaaS / Tool|Marketplace|AI Product|Content / Community|Service / Other>",
  "executionDifficulty": "<EASY|MEDIUM|HARD>",
  "difficultyReason": "<One sentence>",
  "keyStrengths": [
    {"title": "<title>", "explanation": "<2-3 sentences>"},
    {"title": "<title>", "explanation": "<2-3 sentences>"},
    {"title": "<title>", "explanation": "<2-3 sentences>"}
  ],
  "areasForImprovement": [
    {"title": "<title>", "explanation": "<Constructive feedback>"},
    {"title": "<title>", "explanation": "<Constructive feedback>"},
    {"title": "<title>", "explanation": "<Constructive feedback>"}
  ],
  "impactAssessment": "<3-4 sentences on who benefits and how>",
  "recommendations": [
    {"recommendation": "<title>", "explanation": "<Why and how>"},
    {"recommendation": "<title>", "explanation": "<Why and how>"},
    {"recommendation": "<title>", "explanation": "<Why and how>"}
  ],
  "factorBreakdown": {
    "technicalStrength": {"score": <number>, "summary": "<one sentence>"},
    "impactSignificance": {"score": <number>, "summary": "<one sentence>"},
    "scaleReach": {"score": <number>, "summary": "<one sentence>"},
    "usefulnessPracticality": {"score": <number>, "summary": "<one sentence>"},
    "innovationCreativity": {"score": <number>, "summary": "<one sentence>"},
    "feasibility": {"score": <number>, "summary": "<one sentence>"}
  }
}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks.`;
};

// Convert JSON response to plain text format for backward compatibility
const jsonToPlainText = (json: any, isStartupMode: boolean): string => {
  let text = `VIABILITY SCORE: ${json.viabilityScore}%

VERDICT: ${json.verdict}
${json.verdictSummary}

DETECTED CATEGORY: ${json.detectedCategory}

EXECUTION DIFFICULTY: ${json.executionDifficulty}
${json.difficultyReason}

KEY STRENGTHS
`;

  json.keyStrengths?.forEach((s: any, i: number) => {
    text += `${i + 1}. ${s.title}: ${s.explanation}\n`;
  });

  if (isStartupMode) {
    text += `\nCRITICAL WEAKNESSES\n`;
    json.criticalWeaknesses?.forEach((w: any, i: number) => {
      text += `${i + 1}. ${w.title}: ${w.explanation}\n`;
    });

    text += `\nREALITY CHECK\n${json.realityCheck}\n`;
    text += `\nTHE HARSH TRUTH\n${json.harshTruth}\n`;
    text += `\nWHAT YOU MUST DO TO IMPROVE\nImmediate Actions (This Week):\n`;
    json.immediateActions?.forEach((a: any, i: number) => {
      text += `${i + 1}. ${a.action}: ${a.explanation}\n`;
    });

    text += `\nFACTOR BREAKDOWN\n`;
    const fb = json.factorBreakdown;
    text += `Market Opportunity: ${fb?.marketOpportunity?.score}/100 - ${fb?.marketOpportunity?.summary}\n`;
    text += `Problem-Solution Fit: ${fb?.problemSolutionFit?.score}/100 - ${fb?.problemSolutionFit?.summary}\n`;
    text += `Competitive Moat: ${fb?.competitiveMoat?.score}/100 - ${fb?.competitiveMoat?.summary}\n`;
    text += `Execution Reality: ${fb?.executionReality?.score}/100 - ${fb?.executionReality?.summary}\n`;
    text += `Business Model: ${fb?.businessModel?.score}/100 - ${fb?.businessModel?.summary}\n`;
  } else {
    text += `\nAREAS FOR IMPROVEMENT\n`;
    json.areasForImprovement?.forEach((a: any, i: number) => {
      text += `${i + 1}. ${a.title}: ${a.explanation}\n`;
    });

    text += `\nIMPACT ASSESSMENT\n${json.impactAssessment}\n`;
    text += `\nRECOMMENDATIONS\n`;
    json.recommendations?.forEach((r: any, i: number) => {
      text += `${i + 1}. ${r.recommendation}: ${r.explanation}\n`;
    });

    text += `\nFACTOR BREAKDOWN\n`;
    const fb = json.factorBreakdown;
    text += `Technical Strength: ${fb?.technicalStrength?.score}/100 - ${fb?.technicalStrength?.summary}\n`;
    text += `Impact & Significance: ${fb?.impactSignificance?.score}/100 - ${fb?.impactSignificance?.summary}\n`;
    text += `Scale & Reach: ${fb?.scaleReach?.score}/100 - ${fb?.scaleReach?.summary}\n`;
    text += `Usefulness & Practicality: ${fb?.usefulnessPracticality?.score}/100 - ${fb?.usefulnessPracticality?.summary}\n`;
    text += `Innovation & Creativity: ${fb?.innovationCreativity?.score}/100 - ${fb?.innovationCreativity?.summary}\n`;
    text += `Feasibility: ${fb?.feasibility?.score}/100 - ${fb?.feasibility?.summary}\n`;
  }

  return text;
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const clientIP = getClientIP(req);
    
    // Check IP-based rate limit first
    const ipRateLimit = checkRateLimit(`ip:${clientIP}`, MAX_REQUESTS_PER_WINDOW_IP);
    if (!ipRateLimit.allowed) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil(ipRateLimit.resetIn / 1000)
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(ipRateLimit.resetIn / 1000)),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000 + ipRateLimit.resetIn / 1000))
          } 
        }
      );
    }

    // Parse and validate request body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate with Zod schema (strict mode rejects unexpected fields)
    const parseResult = evaluateSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
      console.warn("Validation failed:", errors);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validatedData = parseResult.data;

    // Sanitize and truncate all text inputs for cost control
    const projectType = sanitizeText(validatedData.projectType);
    const problem = truncateText(sanitizeText(validatedData.problem), 3000);
    const solution = truncateText(sanitizeText(validatedData.solution || ""), 2000);
    const targetUsers = truncateText(sanitizeText(validatedData.targetUsers), 2000);
    const differentiation = truncateText(sanitizeText(validatedData.differentiation || ""), 1500);
    const workflow = truncateText(sanitizeText(validatedData.workflow || ""), 2000);

    // Check cache first
    const cacheKey = generateCacheKey(projectType, problem, solution, targetUsers);
    const cachedResult = getCachedResponse(cacheKey);
    
    if (cachedResult) {
      const parsedCache = JSON.parse(cachedResult);
      console.log("Returning cached result for:", cacheKey);
      return new Response(
        JSON.stringify(parsedCache),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-Cache": "HIT"
          } 
        }
      );
    }

    // Check user-based rate limit if authenticated
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );
        const { data: { user }, error } = await supabaseClient.auth.getUser(
          authHeader.replace("Bearer ", "")
        );
        if (!error && user) {
          userId = user.id;
          
          // User-based rate limit
          const userRateLimit = checkRateLimit(`user:${userId}`, MAX_REQUESTS_PER_WINDOW_USER);
          if (!userRateLimit.allowed) {
            console.warn(`Rate limit exceeded for user: ${userId}`);
            return new Response(
              JSON.stringify({ 
                error: "Rate limit exceeded. Please try again later.",
                retryAfter: Math.ceil(userRateLimit.resetIn / 1000)
              }),
              { 
                status: 429, 
                headers: { 
                  ...corsHeaders, 
                  "Content-Type": "application/json",
                  "Retry-After": String(Math.ceil(userRateLimit.resetIn / 1000))
                } 
              }
            );
          }
        }
      } catch (authError) {
        console.warn("Auth verification failed:", authError);
      }
    }

    // Log request (without sensitive data)
    console.log("Evaluation request:", {
      projectType,
      problemLength: problem.length,
      solutionLength: solution.length,
      targetUsersLength: targetUsers.length,
      clientIP: clientIP.substring(0, 10) + "...",
      userId: userId ? userId.substring(0, 8) + "..." : null
    });

    // Get API key from environment
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine evaluation mode based on project type
    const isStartupMode = projectType.toLowerCase() === "startup";
    const systemPrompt = isStartupMode ? getStartupSystemPrompt() : getProjectSystemPrompt();

    // Build user prompt
    let userPrompt = `PROBLEM/IDEA:\n${problem}`;

    if (solution) {
      userPrompt += `\n\nPROPOSED SOLUTION:\n${solution}`;
    }

    userPrompt += `\n\nTARGET ${isStartupMode ? "USERS/CUSTOMERS" : "BENEFICIARIES"}:\n${targetUsers}`;

    if (differentiation) {
      userPrompt += `\n\n${isStartupMode ? "DIFFERENTIATION/COMPETITIVE ADVANTAGE" : "UNIQUE ASPECTS"}:\n${differentiation}`;
    }

    if (workflow) {
      userPrompt += `\n\nWORKFLOW/MECHANISM:\n${workflow}`;
    }

    if (!isStartupMode) {
      userPrompt += `\n\nIMPORTANT: This is a PROJECT (school, college, conference, or personal), NOT a business.`;
    }

    userPrompt += `\n\nProvide your complete evaluation as valid JSON only.`;

    // Call Google Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
          responseMimeType: "application/json"
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Service rate limit. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI service error");
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new Error("No evaluation result received");
    }

    // Parse JSON response
    let evaluationJson;
    try {
      const cleanContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      evaluationJson = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", rawContent);
      throw new Error("Failed to parse evaluation result");
    }

    // Convert to plain text for backward compatibility
    const evaluationResult = jsonToPlainText(evaluationJson, isStartupMode);

    // Extract values
    const verdict = evaluationJson.verdict || "DO NOT BUILD";
    const viabilityScore = typeof evaluationJson.viabilityScore === "number" ? evaluationJson.viabilityScore : null;
    const executionDifficulty = evaluationJson.executionDifficulty || "MEDIUM";
    const inferredCategory = evaluationJson.detectedCategory || "Service / Other";

    console.log("Evaluation complete:", { verdict, viabilityScore, executionDifficulty, inferredCategory });

    const result = {
      verdict,
      fullEvaluation: evaluationResult,
      viabilityScore,
      executionDifficulty,
      inferredCategory,
    };

    // Cache the result
    setCachedResponse(cacheKey, JSON.stringify(result));

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(ipRateLimit.remaining),
          "X-Cache": "MISS"
        } 
      }
    );
  } catch (error) {
    console.error("Evaluation error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred during evaluation" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
