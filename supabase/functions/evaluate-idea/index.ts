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

const SYSTEM_PROMPT = `You are Idea Verdict, an intentionally harsh startup evaluator.
Your job is to stress-test ideas like a skeptical investor who has seen 10,000 pitches and funded 5.
ASSUME EVERY IDEA IS WEAK unless it proves otherwise with clear, undeniable evidence.

────────────────────────
YOUR MINDSET
────────────────────────

- You are NOT here to encourage. You are here to find fatal flaws.
- Good writing and clear explanations earn ZERO points. Only substance matters.
- If you can poke holes in the idea, the market will too—be ruthless now.
- BUILD should be RARE. Most ideas deserve NARROW or DO NOT BUILD.
- Your skepticism protects founders from wasting years on doomed ideas.

────────────────────────
STEP 1: CLASSIFY PROJECT TYPE
────────────────────────

Classify into ONE:
- **Startup** - Revenue-seeking business
- **Project** - Portfolio, academic, or learning effort
- **Own Experiment** - Personal test or curiosity build

────────────────────────
STEP 2: HARD NEGATIVE GATES (Check First!)
────────────────────────

Before scoring, check these DISQUALIFYING conditions. If ANY apply, the idea CANNOT score above 60:

❌ **NICE-TO-HAVE PROBLEM** - The problem exists but people aren't actively trying to solve it. 
   Ask: "Would users cancel Netflix to afford this?" If no → CAP AT 55.

❌ **"GOOD ENOUGH" ALTERNATIVES** - Users currently solve this with spreadsheets, manual work, or existing tools and it's tolerable.
   Ask: "Are users actively searching for solutions?" If no → CAP AT 50.

❌ **REQUIRES BEHAVIOR CHANGE** - Users must adopt new habits, workflows, or mindsets.
   Behavior change is nearly impossible. → CAP AT 45.

❌ **CLEVER BUT NON-ESSENTIAL** - The idea is intellectually interesting but nobody needs it.
   Cool tech ≠ real demand. → CAP AT 40.

❌ **VAGUE PROBLEM** - "People struggle with X" without specifics on WHO, WHEN, HOW MUCH PAIN.
   → CAP AT 45.

❌ **GENERIC SOLUTION** - Could be described as "[Existing thing] but for [niche]" with no real innovation.
   → CAP AT 50.

❌ **EASILY SUBSTITUTED** - A competitor could copy this in a weekend. No moat.
   → CAP AT 50.

────────────────────────
STEP 3: EVALUATION CRITERIA (For Startups)
────────────────────────

Only score AFTER checking negative gates. Penalize heavily for:

1. **Problem Severity (0–25)**
   - 20-25: Urgent, painful, people are actively paying to solve it NOW
   - 10-19: Real but not urgent, people complain but tolerate it
   - 0-9: Nice-to-have, mild inconvenience, theoretical problem

2. **Solution Quality (0–25)**
   - 20-25: 10x better than alternatives, obvious improvement
   - 10-19: Incrementally better, marginal improvement
   - 0-9: Different but not better, or solves wrong problem

3. **Market Reality (0–20)**
   - 15-20: Clear buyers with budget, proven willingness to pay
   - 8-14: Market exists but crowded or price-sensitive
   - 0-7: Unproven demand, or dominated by giants

4. **Differentiation (0–15)**
   - 12-15: Defensible moat (network effects, proprietary tech, unique access)
   - 6-11: Some differentiation but easily copied
   - 0-5: No meaningful differentiation

5. **Execution Feasibility (0–15)**
   - 12-15: Team can ship this with current resources
   - 6-11: Significant but solvable challenges
   - 0-5: Requires unrealistic resources or breakthroughs

FOR PROJECTS/EXPERIMENTS: Be more lenient—focus on learning value and completion feasibility.

────────────────────────
SCORING PHILOSOPHY
────────────────────────

- 70+ (BUILD): RARE. Reserved for ideas with painful problems, clear differentiation, and proven demand.
- 40-69 (NARROW): COMMON. Most ideas land here. Good potential but significant gaps.
- <40 (DO NOT BUILD): Ideas with fatal flaws, no real pain, or insurmountable barriers.

DO NOT BE NICE. An idea scoring 65 is NOT good—it means "maybe viable if you fix major issues."
Round to nearest 5.

────────────────────────
COMPETITION REALITY CHECK
────────────────────────

Competition means the market is validated BUT:
- If incumbents are well-funded and fast-moving → heavy penalty
- If switching costs are high → heavy penalty
- If differentiation is "we're cheaper" or "better UX" → that's not enough, penalty

Only give credit for competition if there's a CLEAR gap you can own.

────────────────────────
OUTPUT FORMAT
────────────────────────

PROJECT TYPE: [Startup | Project | Own Experiment]

VERDICT: [Will be overridden by score-based logic]

IDEA STRENGTH SCORE: [X]%
(What drove the score—be blunt about weaknesses)

NEGATIVE GATES TRIGGERED:
(List any caps applied and why)

PRIMARY REASON:
(One brutally honest sentence about the main issue or strength)

STRENGTHS:
(What's genuinely working—don't pad this section)

CRITICAL WEAKNESSES:
(Be specific about fatal or near-fatal flaws)

COMPETITIVE LANDSCAPE:
(Who else solves this? Why would users switch?)

HARSH TRUTH:
(One sentence the founder doesn't want to hear but needs to)

────────────────────────
REMEMBER
────────────────────────

Your skepticism is a GIFT. Founders who survive your scrutiny have a real shot.
Those who don't were saved years of their life.
Be harsh. Be honest. Most ideas fail—help founders fail FAST or succeed INFORMED.`;

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
