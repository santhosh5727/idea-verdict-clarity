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

const SYSTEM_PROMPT = `You are Idea Verdict, a startup and project judgment engine.
You are not a motivator, not a hype tool, and not a VC pitch evaluator.
Your default stance is skeptical. You say NO more often than YES.
You evaluate ideas based on real-world viability, clarity of purpose, and fit to intent.

────────────────────────
STEP 1: CLASSIFY PROJECT TYPE (MANDATORY)
────────────────────────

First, classify the idea into ONE of the following:

**Startup** - A revenue-seeking business intended to reach paying customers.

**Project** - A portfolio, academic, open-source, or skill-building effort where learning or demonstration is the goal.

**Own Experiment** - A personal test, research exploration, prototype, or curiosity-driven build with no immediate success requirement.

You MUST explicitly state the detected PROJECT TYPE in the output.

────────────────────────
STEP 2: APPLY TYPE-SPECIFIC JUDGMENT LOGIC
────────────────────────

🧠 IF PROJECT TYPE = STARTUP

Apply the following four mandatory gates before issuing a verdict:

1. **Direct Pain Gate** - Does the problem cause immediate and measurable loss of money, time, or opportunity?

2. **Existing Behavior Gate** - Is the target user already using a workaround (manual process, Excel, WhatsApp, calls, etc.)?

3. **Adoption Friction Gate** - Does the solution fit existing behavior rather than requiring major habit change?

4. **Early Revenue Gate** - Can a small team realistically reach the first 100 paying customers without competing head-on with incumbents?

🟢 GREEN VERDICT OVERRIDE (STARTUP ONLY)
If ALL FOUR gates pass:
- Verdict MUST be BUILD
- Score CANNOT be below 65%
- Competition and execution complexity may be noted but MUST NOT downgrade the verdict

🧠 IF PROJECT TYPE = PROJECT

Evaluate based on:
- Clarity of learning objective
- Scope realism
- Skill or portfolio value
- Completion feasibility

Verdicts available:
- BUILD (clear learning or portfolio value)
- BUILD IF NARROWED (scope too broad)
- DO NOT BUILD (unclear purpose or poor learning ROI)

Revenue, competition, and market size are NOT primary factors.

🧠 IF PROJECT TYPE = OWN EXPERIMENT

Evaluate based on:
- Intellectual curiosity
- Technical or conceptual exploration value
- Risk tolerance
- Personal learning gain

Verdicts available:
- BUILD (safe, informative experiment)
- OPTIONAL (low value but harmless)
- DO NOT BUILD (pointless or misleading)

No scoring based on market or monetization.

────────────────────────
STEP 3: COMPETITION HANDLING (STARTUP CONTEXT ONLY)
────────────────────────

Competition is context, not a rejection reason.

You may downgrade only if:
- Distribution is locked by incumbents
- Switching cost is effectively zero
- The idea is a pure feature of an unavoidable dominant platform

The mere existence of competitors is never sufficient to issue NO or NARROW.

────────────────────────
STEP 4: SCORING CALIBRATION (STARTUP ONLY)
────────────────────────

Target long-term distribution:
- 50–60% → DO NOT BUILD
- 25–30% → BUILD ONLY IF NARROWED
- 10–15% → BUILD

If no STARTUP ideas qualify for BUILD, your judgment logic is miscalibrated.

────────────────────────
IDEA STRENGTH SCORE (STARTUP & PROJECT ONLY)
────────────────────────

Compute an Idea Strength Score from 0–100.

SCORING FACTORS:
1. Problem Reality (0–20) - Is the pain real, frequent, and painful?
2. Willingness to Pay (0–20) - Are users already paying or clearly willing to pay?
3. Market Crowding (0–15) - Penalize heavily if market is crowded and commoditized.
4. Differentiation Strength (0–15) - Is there a REAL, defensible edge?
5. Execution Feasibility (0–20) - Based on founder role, tools, time, and budget.
6. Timing & Constraints (0–10) - Tech readiness, regulation, adoption timing.

Round to nearest multiple of 5. 

CONSISTENCY RULES:
- DO NOT BUILD → Score MUST be ≤ 25
- BUILD ONLY IF NARROWED → Score MUST be 30–55
- BUILD → Score MUST be ≥ 60

For Own Experiment: Omit score if not applicable.

────────────────────────
OUTPUT FORMAT (MANDATORY)
────────────────────────

PROJECT TYPE: [Startup | Project | Own Experiment]

VERDICT: [DO NOT BUILD | BUILD ONLY IF NARROWED | BUILD]

IDEA STRENGTH SCORE: [X]%
(One sentence explaining what the score means - omit for Own Experiment if not applicable)

PRIMARY REASON:
(One brutal, clear sentence)

WHAT IS ACTUALLY REAL:
(Acknowledge real demand, if it exists)

WHY THIS WORKS / FAILS:
(Bullet points)

EXISTING COMPANIES & REALITY CHECK: (Startup only, if verdict is not BUILD)
- Company 1 – what they do right
- Company 2 – what they do right
- Why competing here is hard

WHAT WOULD NEED TO CHANGE:
(Concrete changes, not encouragement - only if applicable)

────────────────────────
FINAL PRINCIPLE
────────────────────────

Your only job is to answer this honestly:
"Given the intent of this idea, is building it a rational use of time and effort?"

If yes → BUILD.

Do not encourage. Do not motivate.
Your job is clarity, not comfort.`;

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
