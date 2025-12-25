import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Input validation schema - projectType is context only, everything else is evaluated
const evaluateSchema = z.object({
  projectType: z.string().max(100).optional(),
  problem: z.string().min(1).max(15000),
  solution: z.string().max(15000).optional().default(""),
  targetUsers: z.string().min(1).max(15000),
  differentiation: z.string().max(15000).optional().default(""),
  workflow: z.string().max(20000).optional(),
});

// Fixed category set for classification
const IDEA_CATEGORIES = [
  "SaaS / Tool",
  "Marketplace",
  "AI Product",
  "Content / Community",
  "Service / Other",
] as const;

// Execution modes for internal evaluation adjustment
const EXECUTION_MODES = [
  "Indie / Micro-SaaS",
  "Venture / Hard Tech",
] as const;

// CORS headers with origin validation
const getAllowedOrigins = () => {
  return [
    "https://ideaverdict.in",
    "https://www.ideaverdict.in",
    "https://lovable.dev",
    "https://ideaverdictin.lovable.app",
    "https://*.lovable.app",
    "https://*.lovableproject.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ];
};

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = getAllowedOrigins();
  
  console.log("Request origin:", origin);
  
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

const getSystemPrompt = () => {
  return `You are Idea Verdict — a brutally honest startup evaluation AI built to help founders decide whether to BUILD, NARROW, or DO NOT BUILD an idea.

Your role is not to motivate.
Your role is not to be neutral.
Your role is to help founders make a decision.

You must strictly follow the existing output structure and section names.
Do NOT add, remove, or rename any sections.
Do NOT change the UI-facing order.

━━━━━━━━━━━━━━━━━━
CORE EVALUATION PRINCIPLES
━━━━━━━━━━━━━━━━━━

- Judge ideas based on real-world user and founder behavior, not theoretical value.
- Assume users are busy, lazy, and resistant to changing habits.
- Prefer work removed over convenience added.
- Strongly penalize ideas that rely on reminders, dashboards, notifications, or manual input.
- Treat WhatsApp, AI summaries, and alerts as weak differentiation unless they automate the most painful step.
- If a solution rearranges work instead of removing it, score it low.
- Feature-level ideas should almost never pass.

━━━━━━━━━━━━━━━━━━
PROJECT TYPE → VALUATION ADJUSTMENT
━━━━━━━━━━━━━━━━━━

The detected project type must directly influence scoring, expectations, and verdict.

- Startup / Business Idea:
  Judge on scalability, revenue potential, and clear market pull.

- SaaS / Tool:
  Penalize weak differentiation aggressively.
  Expect clear willingness to pay and retention logic.

- Hardware Project:
  Increase execution difficulty.
  Penalize unclear manufacturing, capital, and distribution plans.

- Academic / School Project:
  Cap viability scores.
  Treat learning value as valid, but commercial success as unlikely.

- Personal Experiment:
  Do not evaluate as a startup.
  Score based on learning or technical merit, not market upside.

If the project type inherently limits upside,
the verdict and score must reflect that clearly.

━━━━━━━━━━━━━━━━━━
SCORING RULES
━━━━━━━━━━━━━━━━━━

- 80-100: Clear pull, painful problem, strong leverage, active willingness to pay.
- 60-79: Real problem but narrow or fragile viability.
- 40-59: Marginal improvement over existing behavior.
- Below 40: Feature, hobby, or learning project.

━━━━━━━━━━━━━━━━━━
VERDICT RULES
━━━━━━━━━━━━━━━━━━

- BUILD:
  Use only when there is a clear 10x advantage and strong pull.

- NARROW:
  Use sparingly.
  Only if ALL conditions are met:
  1) A specific, identifiable niche exists.
  2) Narrowing removes a major adoption barrier.
  3) Narrowing materially increases willingness to pay.
  4) The idea would fail without narrowing.

  If any condition is not clearly met,
  default to DO NOT BUILD.

- DO NOT BUILD:
  Use when the idea is feature-level, easily substituted, behavior-dependent,
  or lacks meaningful upside.

━━━━━━━━━━━━━━━━━━
SECTION-SPECIFIC INSTRUCTIONS
━━━━━━━━━━━━━━━━━━

DETECTED CATEGORY
Choose the closest single category. Be precise.

DETECTED EXECUTION MODE
Justify in one clear sentence. No fluff.

VERDICT
State the verdict decisively. No hedging.

VIABILITY SCORE
Provide a 0-100 score.
Explain it in one sharp sentence focused on adoption and leverage.

EXECUTION DIFFICULTY
LOW, MEDIUM, or HIGH.
Justify using real technical and operational friction.

NEGATIVE GATES TRIGGERED
List only gates that materially hurt viability.
Each must explain real-world impact.

PRIMARY REASON
The single most important reason the idea succeeds or fails.
Be blunt.

STRENGTHS
Only list strengths that materially help adoption or monetization.

CRITICAL WEAKNESSES
Must directly justify the verdict.
No repetition. No vague risks.

COMPETITIVE LANDSCAPE
Answer clearly:
1) Who already solves this well enough?
2) Why would users realistically switch?

EXISTING COMPANIES & REALITY CHECK
Explain why incumbents survive and where this idea loses in practice.

WHAT NEEDS TO CHANGE FOR THIS TO WORK
REQUIRED for ALL verdicts. Be concrete and actionable. No motivation. No encouragement.

HARSH TRUTH
End with one sentence a founder cannot ignore.
No politeness. No optimism.

━━━━━━━━━━━━━━━━━━
FORMATTING & UI CONSTRAINTS
━━━━━━━━━━━━━━━━━━

- Do NOT use markdown.
- Do NOT use **, *, __, or any formatting symbols.
- Output must be plain text only.
- All section subtitles must be written in ALL CAPS on their own line.
- The UI will render ALL CAPS lines as dark subtitles.
- Content under each subtitle must be normal sentence case.
- Be concise, direct, and founder-focused.
- No emojis. No motivational language. No disclaimers.`;
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

    const { projectType, problem, solution, targetUsers, differentiation, workflow } = parseResult.data;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let userPrompt = `Evaluate this idea:`;

    // Include project type as context only (does NOT change scoring or thresholds)
    if (projectType) {
      userPrompt += `

USER-DECLARED PROJECT TYPE (context only, does NOT change evaluation criteria):
${projectType}

Note: This is what the user believes they are building. Use this to understand their intent and expectations, 
but apply the same evaluation standards regardless. Do NOT soften or adjust thresholds based on this.`;
    }

    userPrompt += `

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

First:
1. Classify the idea category
2. Infer the appropriate execution mode based on the idea's characteristics
3. Apply mode-specific evaluation criteria
4. Provide your verdict following the exact output format

IMPORTANT: You MUST include the "WHAT NEEDS TO CHANGE FOR THIS TO WORK" section for ALL verdicts.
Remember to include DETECTED CATEGORY, DETECTED EXECUTION MODE, Viability Score, AND Execution Difficulty.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: getSystemPrompt() },
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

    // Parse the DETECTED EXECUTION MODE from the evaluation
    const modeMatch = evaluationResult.match(/DETECTED EXECUTION MODE:\s*([^\n(]+)/i);
    let inferredExecutionMode = "Indie / Micro-SaaS";
    if (modeMatch) {
      const detectedMode = modeMatch[1].trim();
      if (detectedMode.toLowerCase().includes("venture") || detectedMode.toLowerCase().includes("hard tech")) {
        inferredExecutionMode = "Venture / Hard Tech";
      } else {
        inferredExecutionMode = "Indie / Micro-SaaS";
      }
    }
    console.log("Inferred execution mode:", inferredExecutionMode);

    // Parse the VIABILITY SCORE from the evaluation
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

    // Parse ASYMMETRIC UPSIDE DETECTED
    const asymmetricMatch = evaluationResult.match(/ASYMMETRIC UPSIDE DETECTED:\s*(YES|NO)/i);
    const hasAsymmetricUpside = asymmetricMatch ? asymmetricMatch[1].toUpperCase() === "YES" : false;
    
    // Extract asymmetric upside explanation if present
    let asymmetricUpsideReason = "";
    if (hasAsymmetricUpside) {
      const reasonMatch = evaluationResult.match(/ASYMMETRIC UPSIDE DETECTED:\s*YES\s*\n?\(?([^)]+)\)?/i);
      if (reasonMatch) {
        asymmetricUpsideReason = reasonMatch[1].trim();
      }
    }
    console.log(`Asymmetric upside: ${hasAsymmetricUpside}${asymmetricUpsideReason ? ` - ${asymmetricUpsideReason}` : ""}`);

    // Deterministic verdict based on viability score
    let verdict: string;
    if (viabilityScore !== null) {
      if (viabilityScore >= 70) {
        verdict = "BUILD";
      } else if (viabilityScore >= 40) {
        verdict = "BUILD ONLY IF NARROWED";
      } else {
        verdict = "DO NOT BUILD";
      }
      console.log(`Deterministic verdict: viability=${viabilityScore}%, difficulty=${executionDifficulty}, category=${inferredCategory}, mode=${inferredExecutionMode} → ${verdict}`);
    } else {
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
        viabilityScore,
        executionDifficulty,
        inferredCategory,
        inferredExecutionMode,
        hasAsymmetricUpside,
        asymmetricUpsideReason,
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
