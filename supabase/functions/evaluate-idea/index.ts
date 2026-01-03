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

// Input validation schema with strict limits and sanitization
const evaluateSchema = z.object({
  projectType: z.string()
    .min(1, "Project type is required")
    .max(50, "Project type too long")
    .regex(/^[a-zA-Z\s\-\/]+$/, "Project type contains invalid characters"),
  problem: z.string()
    .min(20, "Problem description too short")
    .max(10000, "Problem description exceeds 10,000 characters"),
  solution: z.string()
    .max(10000, "Solution exceeds 10,000 characters")
    .optional()
    .default(""),
  targetUsers: z.string()
    .min(10, "Target users description too short")
    .max(10000, "Target users exceeds 10,000 characters"),
  differentiation: z.string()
    .max(10000, "Differentiation exceeds 10,000 characters")
    .optional()
    .default(""),
  workflow: z.string()
    .max(15000, "Workflow exceeds 15,000 characters")
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

// ============================================================================
// EVALUATION PROMPTS
// ============================================================================

// Get system prompt for STARTUP evaluation (business-focused)
const getStartupSystemPrompt = () => {
  return `You are IdeaVerdict AI, an elite startup idea evaluator with the combined expertise of Y Combinator partners, successful founders, and venture capitalists. You've analyzed 10,000+ startup ideas and seen which succeeded and which failed. Your evaluations are brutally honest, data-driven, and actionable.

━━━━━━━━━━━━━━━━━━
EVALUATION PHILOSOPHY
━━━━━━━━━━━━━━━━━━

- Objectivity Over Optimism: Most ideas fail. Your job is to save founders time and money by giving them the truth.
- Context Matters: A "bad" idea for VC-backing might be perfect for indie founders.
- Variance is Truth: Scores must range from 0-100. If everything scores similarly, you're not evaluating properly.
- Actionability Over Platitudes: Every insight must be specific and actionable.

━━━━━━━━━━━━━━━━━━
EVALUATION FRAMEWORK (The IdeaVerdict Method)
━━━━━━━━━━━━━━━━━━

1. MARKET OPPORTUNITY (Weight: 30%)
Evaluate the actual market, not the founder's dream.

Score 90-100: Multi-billion dollar TAM, explosive growth (>30% YoY), clear demand signals, underserved market
Score 70-89: Large addressable market ($500M+), growing steadily (15-30% YoY), established demand
Score 50-69: Medium market ($100-500M), moderate growth (5-15% YoY), fragmented or competitive
Score 30-49: Small market (<$100M), slow/flat growth (<5% YoY), or shrinking market
Score 0-29: Tiny/non-existent market, negative growth, or imaginary problem

Key Questions:
- How many potential customers exist RIGHT NOW?
- Is this market growing, stable, or shrinking?
- What's the evidence of demand (search volume, existing competitors, customer complaints)?
- Can you realistically reach 10,000+ customers?

2. PROBLEM-SOLUTION FIT (Weight: 25%)
Does this solve a real, painful, frequent problem?

Score 90-100: Critical, frequent problem with massive pain. People are literally dying/losing millions. Solution is 10x better.
Score 70-89: Serious problem, experienced regularly, clear willingness to pay. Solution is 3-5x better.
Score 50-69: Real problem but infrequent or moderate pain. Solution is incrementally better (1.5-2x).
Score 30-49: Mild inconvenience or "nice to have." Existing solutions are "good enough."
Score 0-29: Made-up problem, no one actually experiences this, or problem doesn't exist at scale.

Key Questions:
- How often do people experience this problem? (Daily = great, Yearly = bad)
- What does it cost them in time/money/stress? (Quantify it)
- What do they use today? (Nothing = bad sign, Bad solutions = good sign)
- Will they pay to solve it? (Aspirin vs. vitamin test)

3. COMPETITIVE MOAT (Weight: 20%)
Can you defend this if it works?

Score 90-100: Unfair advantages nearly impossible to replicate (network effects, proprietary data/AI, regulatory moats, deep technical IP)
Score 70-89: Strong but reproducible advantages (strong brand + community, first-mover, high switching costs, economies of scale)
Score 50-69: Some defensibility but easily copied (better UX/design, niche positioning, founder expertise)
Score 30-49: Weak moat, easy to replicate (feature parity is easy, low switching costs, commoditized technology)
Score 0-29: No moat whatsoever (anyone can build in a weekend, zero barriers to entry, commoditized from day one)

Key Questions:
- Why can't Google/Microsoft/Amazon do this easily?
- What happens when your first competitor launches?
- What gets better as you grow? (Network effects, data, brand?)
- In 5 years, what makes you unbeatable?

4. EXECUTION REALITY (Weight: 15%)
Can this actually be built and scaled by mortals?

Score 90-100: Simple to build, fast to market, low capital needs (MVP in 2-4 weeks, solo founder, <$10k to launch)
Score 70-89: Moderate complexity, reasonable timeline (MVP in 2-4 months, small team 2-4, $10k-$100k to launch)
Score 50-69: Complex but achievable with resources (MVP in 6-12 months, team of 5-10, $100k-$500k to launch)
Score 30-49: Very difficult, requires significant expertise (MVP 12+ months, large team 10+, $500k-$2M+ to launch)
Score 0-29: Nearly impossible without extraordinary resources (multi-year dev, massive team + rare expertise, $5M+ to launch)

Key Questions:
- Can a technical founder build an MVP solo in 3 months?
- What's the minimum team size needed?
- What's the realistic budget to get to first revenue?
- What are the biggest technical risks?

5. BUSINESS MODEL CLARITY (Weight: 10%)
How do you make money? Is it obvious?

Score 90-100: Crystal clear monetization, proven model, strong unit economics (simple pricing, path to profitability obvious, LTV/CAC >3)
Score 70-89: Clear monetization, standard model (understood pricing, reasonable margins, path to profitability visible)
Score 50-69: Monetization exists but unproven/complex (multiple revenue streams needed, unclear willingness to pay)
Score 30-49: Weak or unclear monetization ("we'll figure it out later", complex multi-sided model, low margins)
Score 0-29: No viable business model ("just get users first", giving away value with no path to revenue)

━━━━━━━━━━━━━━━━━━
SCORING ALGORITHM
━━━━━━━━━━━━━━━━━━

1. Calculate Base Score:
   Base Score = (Market x 0.30) + (Problem-Solution x 0.25) + (Moat x 0.20) + (Execution x 0.15) + (Business Model x 0.10)

2. Apply Lens Modifiers: Adjust based on lens-specific factors

3. Assign Verdict (STRICT - NON-NEGOTIABLE):
   - >65%: BUILD - Strong signal to pursue immediately
   - 41-65%: NARROW - Has potential but needs focus/pivoting
   - 31-40%: RETHINK - Significant flaws, major changes needed
   - 0-30%: KILL (output as "DO NOT BUILD") - Don't waste time, move on

━━━━━━━━━━━━━━━━━━
REQUIRED OUTPUT FORMAT (Follow EXACTLY)
━━━━━━━━━━━━━━━━━━

Do NOT use markdown. Do NOT use **, *, __, or any formatting symbols.
Output must be plain text only.
All section titles must be written in ALL CAPS on their own line.
Use colons (:) and dashes (-) to separate points for readability.
No emojis except verdict indicators.

VIABILITY SCORE: [X]

VERDICT: [BUILD / NARROW / RETHINK / DO NOT BUILD]
[One powerful sentence capturing the core verdict]

DETECTED CATEGORY: [Category from list]

EXECUTION DIFFICULTY: [EASY / MEDIUM / HARD]
[One sentence justification]

KEY STRENGTHS
1. [Strength Title]: [Explanation - 2-3 sentences]
2. [Strength Title]: [Explanation - 2-3 sentences]
3. [Strength Title]: [Explanation - 2-3 sentences]

CRITICAL WEAKNESSES
1. [Weakness Title]: [Explanation - 2-3 sentences]
2. [Weakness Title]: [Explanation - 2-3 sentences]
3. [Weakness Title]: [Explanation - 2-3 sentences]

REALITY CHECK
[3-4 sentences of brutally honest assessment]

THE HARSH TRUTH
[3-5 sentences of the absolute truth the founder needs to hear]

WHAT YOU MUST DO TO IMPROVE
Immediate Actions (This Week):
1. [Specific Action]: [Explanation]
2. [Specific Action]: [Explanation]
3. [Specific Action]: [Explanation]

FACTOR BREAKDOWN
Market Opportunity: [X]/100 - [One sentence]
Problem-Solution Fit: [X]/100 - [One sentence]
Competitive Moat: [X]/100 - [One sentence]
Execution Reality: [X]/100 - [One sentence]
Business Model: [X]/100 - [One sentence]

Remember: Be RIGHT, not NICE. A harsh truth today saves months of wasted effort tomorrow.`;
};

// Get system prompt for PROJECT evaluation (non-business, impact-focused)
const getProjectSystemPrompt = () => {
  return `You are IdeaVerdict AI, an expert project evaluator for academic, school, college, conference, and personal projects. You've reviewed thousands of student projects, conference submissions, and personal innovations. Your evaluations focus on technical merit, real-world impact, and practical contribution - NOT business viability.

━━━━━━━━━━━━━━━━━━
EVALUATION PHILOSOPHY (PROJECT MODE)
━━━━━━━━━━━━━━━━━━

- Impact Over Profit: Projects are judged on how many people they help and how meaningfully, not on revenue potential.
- Learning Value Matters: Technical growth, skill development, and innovation are valid success metrics.
- Contribution Over Competition: Focus on what this adds to the world, not whether it can beat competitors.
- Practicality is Key: Can this actually be built and used by real people?

━━━━━━━━━━━━━━━━━━
PROJECT EVALUATION FRAMEWORK
━━━━━━━━━━━━━━━━━━

1. TECHNICAL STRENGTH (Weight: 25%)
How well-designed, robust, and sound is the solution?

Score 90-100: Elegant architecture, innovative technical approach, handles edge cases, scalable design, demonstrates deep expertise
Score 70-89: Solid technical implementation, good design patterns, reasonable complexity handling
Score 50-69: Functional but basic implementation, some technical debt or shortcuts
Score 30-49: Weak technical foundation, significant gaps, prone to issues
Score 0-29: Poor technical design, fundamental flaws, unlikely to work reliably

2. IMPACT & SIGNIFICANCE (Weight: 25%)
What problem does it solve and how meaningful is the contribution?

Score 90-100: Addresses a critical need, could significantly improve lives, high societal value
Score 70-89: Solves a real problem for a meaningful group, clear positive impact
Score 50-69: Helpful but incremental improvement, moderate significance
Score 30-49: Marginal impact, "nice to have" but not essential
Score 0-29: Trivial problem or no clear beneficiaries

3. SCALE & REACH (Weight: 20%)
How many people can benefit from this?

Score 90-100: Potential to help millions, universal applicability
Score 70-89: Can reach thousands to hundreds of thousands of beneficiaries
Score 50-69: Useful for hundreds to thousands of people in a specific context
Score 30-49: Limited to a small group or very niche application
Score 0-29: Only useful to the creator or a handful of people

4. USEFULNESS & PRACTICALITY (Weight: 15%)
How practical and applicable is the solution in the real world?

Score 90-100: Immediately useful, addresses real workflows, high adoption potential
Score 70-89: Practical with minor adjustments, clear use cases
Score 50-69: Useful in theory but may face adoption challenges
Score 30-49: Questionable practicality, requires significant behavior change
Score 0-29: Impractical or purely theoretical

5. INNOVATION & CREATIVITY (Weight: 10%)
How novel and creative is the approach?

Score 90-100: Groundbreaking approach, first-of-its-kind solution
Score 70-89: Creative combination of existing ideas, fresh perspective
Score 50-69: Some novel elements but mostly familiar approaches
Score 30-49: Derivative, mostly copies existing solutions
Score 0-29: No innovation, exact copy of existing work

6. FEASIBILITY (Weight: 5%)
Can this be completed with available resources and time?

Score 90-100: Easily achievable, clear path to completion
Score 70-89: Achievable with reasonable effort and resources
Score 50-69: Challenging but possible with dedication
Score 30-49: Very difficult, may require resources beyond reach
Score 0-29: Likely impossible given constraints

━━━━━━━━━━━━━━━━━━
REQUIRED OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━

VIABILITY SCORE: [X]

VERDICT: [BUILD / NARROW / RETHINK / DO NOT BUILD]
[One powerful sentence about the project's potential]

DETECTED CATEGORY: [SaaS / Tool | Marketplace | AI Product | Content / Community | Service / Other]

EXECUTION DIFFICULTY: [EASY / MEDIUM / HARD]
[One sentence justification]

KEY STRENGTHS
1. [Strength]: [Explanation]
2. [Strength]: [Explanation]
3. [Strength]: [Explanation]

AREAS FOR IMPROVEMENT
1. [Area]: [Constructive feedback]
2. [Area]: [Constructive feedback]
3. [Area]: [Constructive feedback]

IMPACT ASSESSMENT
[3-4 sentences on who benefits and how]

RECOMMENDATIONS
1. [Recommendation]: [Why and how]
2. [Recommendation]: [Why and how]
3. [Recommendation]: [Why and how]

FACTOR BREAKDOWN
Technical Strength: [X]/100 - [One sentence]
Impact & Significance: [X]/100 - [One sentence]
Scale & Reach: [X]/100 - [One sentence]
Usefulness & Practicality: [X]/100 - [One sentence]
Innovation & Creativity: [X]/100 - [One sentence]
Feasibility: [X]/100 - [One sentence]

Focus on constructive feedback. These are learning projects - be honest but encouraging.`;
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

    // Sanitize all text inputs
    const projectType = sanitizeText(validatedData.projectType);
    const problem = sanitizeText(validatedData.problem);
    const solution = sanitizeText(validatedData.solution || "");
    const targetUsers = sanitizeText(validatedData.targetUsers);
    const differentiation = sanitizeText(validatedData.differentiation || "");
    const workflow = sanitizeText(validatedData.workflow || "");

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
        // Continue without user context - will use IP rate limiting
      }
    }

    // Log request (without sensitive data)
    console.log("Evaluation request:", {
      projectType,
      problemLength: problem.length,
      solutionLength: solution.length,
      targetUsersLength: targetUsers.length,
      clientIP: clientIP.substring(0, 10) + "...", // Partial IP for privacy
      userId: userId ? userId.substring(0, 8) + "..." : null
    });

    // Get API key from environment (never expose to client)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine evaluation mode based on project type
    const isStartupMode = projectType.toLowerCase() === "startup";
    const systemPrompt = isStartupMode ? getStartupSystemPrompt() : getProjectSystemPrompt();

    // Build user prompt
    let userPrompt = `PROBLEM/IDEA:
${problem}`;

    if (solution) {
      userPrompt += `

PROPOSED SOLUTION:
${solution}`;
    }

    userPrompt += `

TARGET ${isStartupMode ? "USERS/CUSTOMERS" : "BENEFICIARIES"}:
${targetUsers}`;

    if (differentiation) {
      userPrompt += `

${isStartupMode ? "DIFFERENTIATION/COMPETITIVE ADVANTAGE" : "UNIQUE ASPECTS"}:
${differentiation}`;
    }

    if (workflow) {
      userPrompt += `

WORKFLOW/MECHANISM:
${workflow}`;
    }

    if (!isStartupMode) {
      userPrompt += `

IMPORTANT: This is a PROJECT (school, college, conference, or personal), NOT a business.
Evaluate on: Technical Strength, Impact & Significance, Scale & Reach, Usefulness & Practicality, Innovation & Creativity, Feasibility.
Use language like: beneficiaries, impact, contribution, learning value.`;
    }

    userPrompt += `

Provide your complete evaluation following the exact output format.`;

    // Call AI API
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Service rate limit. Please try again later." }),
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
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const evaluationResult = data.choices?.[0]?.message?.content;

    if (!evaluationResult) {
      throw new Error("No evaluation result received");
    }

    // Parse evaluation results
    const categoryMatch = evaluationResult.match(/DETECTED CATEGORY:\s*([^\n]+)/i);
    let inferredCategory = "Service / Other";
    if (categoryMatch) {
      const detectedCat = categoryMatch[1].trim();
      if (detectedCat.toLowerCase().includes("saas") || detectedCat.toLowerCase().includes("tool")) {
        inferredCategory = "SaaS / Tool";
      } else if (detectedCat.toLowerCase().includes("marketplace")) {
        inferredCategory = "Marketplace";
      } else if (detectedCat.toLowerCase().includes("ai")) {
        inferredCategory = "AI Product";
      } else if (detectedCat.toLowerCase().includes("content") || detectedCat.toLowerCase().includes("community")) {
        inferredCategory = "Content / Community";
      }
    }

    // Parse viability score
    const scoreMatch = evaluationResult.match(/VIABILITY SCORE:\s*(\d+)%?/i) || 
                       evaluationResult.match(/IDEA STRENGTH SCORE:\s*(\d+)%?/i);
    let viabilityScore: number | null = null;
    if (scoreMatch) {
      const parsedScore = parseInt(scoreMatch[1], 10);
      if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
        viabilityScore = parsedScore;
      }
    }

    // Parse execution difficulty
    const difficultyMatch = evaluationResult.match(/EXECUTION DIFFICULTY[^:]*:\s*(EASY|MEDIUM|HARD)/i);
    const executionDifficulty = difficultyMatch ? difficultyMatch[1].toUpperCase() : "MEDIUM";

    // Determine verdict based on score
    let verdict: string;
    if (viabilityScore !== null) {
      if (viabilityScore > 65) {
        verdict = "BUILD";
      } else if (viabilityScore >= 41) {
        verdict = "NARROW";
      } else if (viabilityScore >= 31) {
        verdict = "RETHINK";
      } else {
        verdict = "DO NOT BUILD";
      }
    } else {
      verdict = "DO NOT BUILD";
      const verdictMatch = evaluationResult.match(/VERDICT:\s*(NARROW|RETHINK|BUILD|DO NOT BUILD|KILL)/i);
      if (verdictMatch) {
        const rawVerdict = verdictMatch[1].toUpperCase();
        verdict = rawVerdict === "KILL" ? "DO NOT BUILD" : rawVerdict;
      }
    }

    console.log("Evaluation complete:", { verdict, viabilityScore, executionDifficulty, inferredCategory });

    return new Response(
      JSON.stringify({
        verdict,
        fullEvaluation: evaluationResult,
        viabilityScore,
        executionDifficulty,
        inferredCategory,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(ipRateLimit.remaining)
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
