import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Input validation schema
const evaluateSchema = z.object({
  problem: z.string().min(1).max(15000),
  solution: z.string().max(15000).optional().default(""),
  targetUsers: z.string().min(1).max(15000),
  differentiation: z.string().max(15000).optional().default(""),
  workflow: z.string().max(20000).optional(),
  projectType: z.enum(["startup", "hardware", "academic", "personal"]).optional().default("startup"),
});

// CORS headers with origin validation
const getAllowedOrigins = () => {
  return [
    // Production domain
    "https://ideaverdict.in",
    "https://www.ideaverdict.in",
    // Lovable preview domains
    "https://lovable.dev",
    "https://ideaverdictin.lovable.app",
    // Wildcard patterns for Lovable
    "https://*.lovable.app",
    "https://*.lovableproject.com",
    // Development
    "http://localhost:5173",
    "http://localhost:3000",
  ];
};

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = getAllowedOrigins();
  
  console.log("Request origin:", origin);
  
  // Check if origin matches any allowed pattern
  const isAllowed = allowedOrigins.some(allowed => {
    if (allowed.includes("*")) {
      const pattern = allowed.replace("*", ".*");
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return allowed === origin;
  });
  
  console.log("Origin allowed:", isAllowed);
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

const SYSTEM_PROMPT = `You are Idea Verdict, a thoughtful startup and project evaluation assistant.
Your goal is to provide honest, balanced feedback that helps founders make informed decisions.
You evaluate ideas based on real-world viability, clarity of purpose, and potential for success.

────────────────────────
STEP 1: CLASSIFY PROJECT TYPE
────────────────────────

Classify the idea into ONE of the following:

**Startup** - A revenue-seeking business intended to reach paying customers.

**Project** - A portfolio, academic, open-source, or skill-building effort where learning or demonstration is the goal.

**Own Experiment** - A personal test, research exploration, prototype, or curiosity-driven build.

State the detected PROJECT TYPE in your output.

────────────────────────
STEP 2: EVALUATION CRITERIA
────────────────────────

🧠 FOR STARTUPS, evaluate:

1. **Problem Clarity** - Is the problem well-defined and does it cause real pain for users?

2. **Solution Fit** - Does the proposed solution effectively address the problem?

3. **Target User Definition** - Are target users clearly identified and reachable?

4. **Market Opportunity** - Is there room in the market for this solution?

5. **Differentiation** - What makes this approach unique or better?

6. **Execution Feasibility** - Can this realistically be built and launched?

🧠 FOR PROJECTS, evaluate:
- Clarity of learning objective
- Scope realism
- Skill or portfolio value
- Completion feasibility

🧠 FOR EXPERIMENTS, evaluate:
- Exploration value
- Learning potential
- Technical interest

────────────────────────
STEP 3: COMPETITION CONTEXT
────────────────────────

Competition indicates market validation, not automatic failure.
Consider: Can this idea carve out a niche, serve an underserved segment, or offer a meaningfully better experience?

Only penalize for competition if:
- Market is completely dominated with no gaps
- Switching costs make user acquisition nearly impossible
- The idea offers no meaningful differentiation

────────────────────────
IDEA STRENGTH SCORE (0–100)
────────────────────────

Compute an Idea Strength Score based on:

1. Problem Significance (0–25) - How real and painful is the problem?
2. Solution Quality (0–25) - How well does the solution address it?
3. Market & Competition (0–20) - Is there opportunity in the market?
4. Differentiation (0–15) - Is there a clear unique angle?
5. Execution Feasibility (0–15) - How realistic is implementation?

Be fair and balanced in scoring. Good ideas with clear value should score well.
Round to nearest multiple of 5.

IMPORTANT: Provide only the score and reasoning. The verdict will be determined separately based on thresholds.

────────────────────────
OUTPUT FORMAT
────────────────────────

PROJECT TYPE: [Startup | Project | Own Experiment]

VERDICT: [Your recommendation - this will be overridden by score-based logic]

IDEA STRENGTH SCORE: [X]%
(Brief explanation of what drove the score)

PRIMARY REASON:
(One clear, honest sentence about the main factor in your evaluation)

STRENGTHS:
(What's working well with this idea - be specific)

AREAS FOR IMPROVEMENT:
(Constructive feedback on what could be better)

COMPETITIVE LANDSCAPE: (For startups)
(Brief overview of the market and how this idea fits)

RECOMMENDATIONS:
(Actionable suggestions if applicable)

────────────────────────
GUIDING PRINCIPLE
────────────────────────

Your job is to help founders understand their idea's strengths and weaknesses.
Be honest but constructive. Acknowledge what's working while pointing out gaps.
Focus on providing actionable insights, not just judgments.`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id);

    // Parse and validate input
    const rawBody = await req.json();
    console.log("EVALUATION PAYLOAD", rawBody);
    const parseResult = evaluateSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error("Validation failed:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parseResult.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { problem, solution, targetUsers, differentiation, workflow, projectType } = parseResult.data;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let userPrompt = `Evaluate this idea:

PROJECT TYPE: ${projectType}

PROBLEM:
${problem}

SOLUTION:
${solution}

TARGET USERS:
${targetUsers}

DIFFERENTIATION:
${differentiation}`;

    if (workflow) {
      userPrompt += `

WORKFLOW / MECHANISM (Optional context - do not reward complexity):
${workflow}`;
    }

    userPrompt += `

Provide your verdict following the exact output format.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
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

    // Parse the score from the evaluation - this is the SINGLE SOURCE OF TRUTH
    const scoreMatch = evaluationResult.match(/IDEA STRENGTH SCORE:\s*(\d+)%?/i);
    let score: number | null = null;
    if (scoreMatch) {
      const parsedScore = parseInt(scoreMatch[1], 10);
      if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
        score = parsedScore;
      }
    }

    // Deterministic verdict based on score (NEVER trust AI's verdict string)
    // Score >= 70 → BUILD, Score 40-69 → NARROW, Score < 40 → KILL
    let verdict: string;
    if (score !== null) {
      if (score >= 70) {
        verdict = "BUILD";
      } else if (score >= 40) {
        verdict = "BUILD ONLY IF NARROWED";
      } else {
        verdict = "DO NOT BUILD";
      }
      console.log(`Deterministic verdict: score=${score}% → ${verdict}`);
    } else {
      // Fallback ONLY if no score found (should rarely happen)
      // Parse AI's verdict string as last resort
      verdict = "DO NOT BUILD";
      const verdictMatch = evaluationResult.match(/VERDICT:\s*(BUILD ONLY IF NARROWED|BUILD|DO NOT BUILD|OPTIONAL)/i);
      if (verdictMatch) {
        verdict = verdictMatch[1].toUpperCase();
      } else if (evaluationResult.includes("BUILD ONLY IF NARROWED")) {
        verdict = "BUILD ONLY IF NARROWED";
      } else if (evaluationResult.includes("OPTIONAL")) {
        verdict = "OPTIONAL";
      } else if (/\bVERDICT:?\s*BUILD\b/i.test(evaluationResult)) {
        verdict = "BUILD";
      }
      console.log(`Fallback verdict (no score found): ${verdict}`);
    }

    return new Response(
      JSON.stringify({
        verdict,
        fullEvaluation: evaluationResult,
        projectType,
        score, // Include score in response for transparency
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Evaluation error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred during evaluation" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
