import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Input validation schema - projectType is now removed as it's inferred
const evaluateSchema = z.object({
  problem: z.string().min(1).max(15000),
  solution: z.string().max(15000).optional().default(""),
  targetUsers: z.string().min(1).max(15000),
  differentiation: z.string().max(15000).optional().default(""),
  workflow: z.string().max(20000).optional(),
  evaluationMode: z.enum(["indie", "venture", "academic"]).optional().default("indie"),
});

// Fixed category set for classification
const IDEA_CATEGORIES = [
  "SaaS / Tool",
  "Marketplace",
  "AI Product",
  "Content / Community",
  "Service / Other",
] as const;

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

const getCategoryRiskContext = (category: string) => {
  const riskContexts: Record<string, string> = {
    "SaaS / Tool": `
CATEGORY-SPECIFIC RISKS FOR SAAS/TOOL:
- Churn risk: How sticky is the solution? Can users easily switch?
- Feature commoditization: Can competitors copy core features quickly?
- Pricing pressure: Is there a race to the bottom in this space?`,
    "Marketplace": `
CATEGORY-SPECIFIC RISKS FOR MARKETPLACE:
- Chicken-and-egg problem: How will you bootstrap supply and demand simultaneously?
- Liquidity risk: Can you achieve enough transactions to be useful?
- Disintermediation: Will users bypass the platform once connected?
- Trust & safety costs: What moderation/verification is needed?`,
    "AI Product": `
CATEGORY-SPECIFIC RISKS FOR AI PRODUCT:
- Data dependency: Where does training/inference data come from?
- Model commoditization: Can competitors use the same base models?
- Accuracy requirements: What's the cost of errors in this domain?
- API dependency: Are you building on rented land (OpenAI, etc.)?`,
    "Content / Community": `
CATEGORY-SPECIFIC RISKS FOR CONTENT/COMMUNITY:
- Cold start problem: How do you get the first engaged users?
- Moderation burden: What content policies and enforcement are needed?
- Monetization challenge: Can you monetize without killing the community?
- Network effects: Is there genuine lock-in or can users leave easily?`,
    "Service / Other": `
CATEGORY-SPECIFIC RISKS FOR SERVICE/OTHER:
- Scalability limits: How do you grow beyond your own time?
- Productization path: Can this become a product or is it forever a service?
- Margin compression: What prevents clients from pushing fees down?`,
  };
  return riskContexts[category] || "";
};

const getSystemPrompt = (evaluationMode: string) => {
  const modeContext = {
    indie: `
MODE: INDIE / MICRO-SAAS
This mode is optimized for solo founders and small teams building bootstrapped products.
Evaluation priorities:
- Can one person or small team ship this?
- Is there a clear path to $10K-$100K MRR?
- Does it require venture funding to succeed? (If yes, penalize)
- Can it be profitable without massive scale?`,
    venture: `
MODE: VENTURE / INFRA / HARD TECH
This mode accounts for high-difficulty, high-capital ideas where execution risk is accepted.
Evaluation priorities:
- Is the market large enough to justify venture funding?
- Is technical difficulty creating a real moat?
- Does complexity serve a purpose or is it self-imposed?
- Allow high difficulty scores but do NOT inflate viability just because it's "hard tech"`,
    academic: `
MODE: ACADEMIC / LEARNING PROJECT
This mode judges learning value and technical growth, NOT monetization.
Evaluation priorities:
- Does this teach valuable skills?
- Is the scope appropriate for learning?
- Will completing this build portfolio-worthy work?
- Ignore market viability, focus on educational merit`
  };

  return `You are Idea Verdict, an intentionally harsh startup evaluator.
Your job is to stress-test ideas like a skeptical investor who has seen 10,000 pitches and funded 5.
ASSUME EVERY IDEA IS WEAK unless it proves otherwise with clear, undeniable evidence.

${modeContext[evaluationMode as keyof typeof modeContext] || modeContext.indie}

────────────────────────
SYSTEM POSITIONING (User will see this)
────────────────────────

This engine is optimized to prevent wasted effort on low-leverage ideas.
It is intentionally conservative and biased against high-risk execution.
A low score does NOT mean the idea is bad.
It means the execution risk is high under the selected mode.

────────────────────────
YOUR MINDSET
────────────────────────

- You are NOT here to encourage. You are here to find fatal flaws.
- Good writing and clear explanations earn ZERO points. Only substance matters.
- If you can poke holes in the idea, the market will too—be ruthless now.
- BUILD should be RARE. Most ideas deserve NARROW or DO NOT BUILD.
- Your skepticism protects founders from wasting years on doomed ideas.

────────────────────────
STEP 1: CLASSIFY IDEA CATEGORY
────────────────────────

First, classify the idea into ONE of these categories based on its description:
- **SaaS / Tool** - Software products, productivity tools, B2B/B2C software
- **Marketplace** - Two-sided platforms connecting buyers and sellers
- **AI Product** - Products where AI/ML is the core value proposition
- **Content / Community** - Media, content platforms, community-driven products
- **Service / Other** - Services, consulting, hardware, or ideas that don't fit above

If the idea doesn't clearly fit a category, classify it as "Service / Other" rather than guessing.

Output the category at the start of your evaluation:
DETECTED CATEGORY: [Category Name]

After classifying, apply category-specific risk checks (these are INTERNAL context, not separate output sections).

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
STEP 3: SCORING (TWO SEPARATE AXES)
────────────────────────

You MUST provide TWO separate signals. Do NOT collapse them.

**AXIS 1: VIABILITY SCORE (0–100)**
Definition: "Probability that this idea can succeed in principle, given the evaluation mode."

For Startups (Indie mode):
1. Problem Severity (0–25): How painful and urgent?
2. Solution Quality (0–25): How much better than alternatives?
3. Market Reality (0–20): Proven willingness to pay?
4. Differentiation (0–15): Defensible moat?
5. Execution Feasibility (0–15): Can be shipped with current resources?

For Venture mode: Allow higher complexity but require proportional market size.
For Academic mode: Score learning value, skill development, and project completion feasibility.

**AXIS 2: EXECUTION DIFFICULTY**
One of: LOW | MEDIUM | EXTREME

- LOW: Single founder can ship in weeks/months, known tech stack, clear playbook
- MEDIUM: Requires team, 6-12 months runway, some technical uncertainty
- EXTREME: Requires significant capital, multi-year timeline, unproven tech, or regulatory hurdles

CRITICAL: High difficulty does NOT reduce viability. Hard problems can be highly viable.
         Easy problems can have low viability.

────────────────────────
SCORING PHILOSOPHY
────────────────────────

- 70+ (BUILD): RARE. Reserved for ideas with painful problems, clear differentiation, and proven demand.
- 40-69 (NARROW): COMMON. Most ideas land here. Good potential but significant gaps.
- <40 (DO NOT BUILD): Ideas with fatal flaws, no real pain, or insurmountable barriers.

DO NOT BE NICE. An idea scoring 65 is NOT good—it means "maybe viable if you fix major issues."
Round viability to nearest 5.

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

DETECTED CATEGORY: [SaaS / Tool | Marketplace | AI Product | Content / Community | Service / Other]

VERDICT: [Will be overridden by score-based logic]

VIABILITY SCORE: [X]%
(What drove the score—be blunt about weaknesses)

EXECUTION DIFFICULTY: [LOW | MEDIUM | EXTREME]
(Justify: What makes this easy or hard to execute?)

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

**EXISTING COMPANIES & REALITY CHECK:**
(REQUIRED for DO NOT BUILD and BUILD ONLY IF NARROWED verdicts)
- List 2-4 real companies or categories doing similar work
- State why they survive (what do they have that this idea lacks?)
- State why a new entrant struggles here
- Use cautious phrasing if uncertain ("examples include", "companies like")
- Do NOT invent fake startups

HARSH TRUTH:
(One sentence the founder doesn't want to hear but needs to)

────────────────────────
REMEMBER
────────────────────────

Your skepticism is a GIFT. Founders who survive your scrutiny have a real shot.
Those who don't were saved years of their life.
Be harsh. Be honest. Most ideas fail—help founders fail FAST or succeed INFORMED.`;
};

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

    const { problem, solution, targetUsers, differentiation, workflow, evaluationMode } = parseResult.data;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const modeLabels: Record<string, string> = {
      indie: "Indie / Micro-SaaS",
      venture: "Venture / Infra / Hard Tech",
      academic: "Academic / Learning Project"
    };

    let userPrompt = `Evaluate this idea:

EVALUATION MODE: ${modeLabels[evaluationMode] || "Indie / Micro-SaaS"}

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

First classify the idea into one of the categories, then provide your verdict following the exact output format. Remember to include BOTH Viability Score AND Execution Difficulty.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: getSystemPrompt(evaluationMode) },
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

    // Parse the DETECTED CATEGORY from the evaluation
    const categoryMatch = evaluationResult.match(/DETECTED CATEGORY:\s*([^\n]+)/i);
    let inferredCategory = "Service / Other";
    if (categoryMatch) {
      const detectedCat = categoryMatch[1].trim();
      // Normalize to one of our fixed categories
      if (detectedCat.toLowerCase().includes("saas") || detectedCat.toLowerCase().includes("tool")) {
        inferredCategory = "SaaS / Tool";
      } else if (detectedCat.toLowerCase().includes("marketplace")) {
        inferredCategory = "Marketplace";
      } else if (detectedCat.toLowerCase().includes("ai")) {
        inferredCategory = "AI Product";
      } else if (detectedCat.toLowerCase().includes("content") || detectedCat.toLowerCase().includes("community")) {
        inferredCategory = "Content / Community";
      } else {
        inferredCategory = "Service / Other";
      }
    }
    console.log("Inferred category:", inferredCategory);

    // Parse the VIABILITY SCORE from the evaluation - this is the SINGLE SOURCE OF TRUTH
    const scoreMatch = evaluationResult.match(/VIABILITY SCORE:\s*(\d+)%?/i) || 
                       evaluationResult.match(/IDEA STRENGTH SCORE:\s*(\d+)%?/i);
    let viabilityScore: number | null = null;
    if (scoreMatch) {
      const parsedScore = parseInt(scoreMatch[1], 10);
      if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
        viabilityScore = parsedScore;
      }
    }

    // Parse EXECUTION DIFFICULTY
    const difficultyMatch = evaluationResult.match(/EXECUTION DIFFICULTY:\s*(LOW|MEDIUM|EXTREME)/i);
    const executionDifficulty = difficultyMatch ? difficultyMatch[1].toUpperCase() : "MEDIUM";

    // Deterministic verdict based on viability score (NEVER trust AI's verdict string)
    // Score >= 70 → BUILD, Score 40-69 → NARROW, Score < 40 → KILL
    let verdict: string;
    if (viabilityScore !== null) {
      if (viabilityScore >= 70) {
        verdict = "BUILD";
      } else if (viabilityScore >= 40) {
        verdict = "BUILD ONLY IF NARROWED";
      } else {
        verdict = "DO NOT BUILD";
      }
      console.log(`Deterministic verdict: viability=${viabilityScore}%, difficulty=${executionDifficulty}, category=${inferredCategory} → ${verdict}`);
    } else {
      // Fallback ONLY if no score found (should rarely happen)
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
        evaluationMode,
        viabilityScore,
        executionDifficulty,
        inferredCategory,
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
