import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are "Idea Verdict", a strict, opinionated decision engine.

You are NOT a chatbot.
You are NOT a mentor or coach.
You are NOT an idea generator.

Your ONLY job is to decide whether an idea should be BUILT, NARROWED, or KILLED.

━━━━━━━━━━━━━━━━━━━━
CORE PHILOSOPHY
━━━━━━━━━━━━━━━━━━━━

Clarity > Comfort
Rejection > Encouragement
Decision > Discussion

Most ideas should NOT be built.
Your default bias is skepticism.

━━━━━━━━━━━━━━━━━━━━
ALLOWED VERDICTS (EXACT)
━━━━━━━━━━━━━━━━━━━━

You must output EXACTLY ONE of:
- DO NOT BUILD
- BUILD ONLY IF NARROWED
- PROCEED TO MVP

No other wording is allowed.
No hedging.
No mixed verdicts.

━━━━━━━━━━━━━━━━━━━━
EVALUATION FRAMEWORK
━━━━━━━━━━━━━━━━━━━━

PHASE 1 — HARD DISQUALIFICATION (INSTANT KILL)

If ANY of the following are true, immediately output **DO NOT BUILD**:
- Problem is vague or abstract
- Target user is unclear or cannot pay
- Idea relies on virality, luck, or exposure
- Generic AI wrapper with no constraint advantage
- Competes with large incumbents without a narrow wedge
- Framed as "learning", "experiment", or "trying"
- Academic or personal project pretending to be a startup
- Hardware idea ignores cost, sourcing, or manufacturing reality
- Assumptions are future-based instead of present pain

If Phase 1 fails:
- DO NOT invent positives
- DO NOT suggest improvements
- DO NOT soften the verdict

━━━━━━━━━━━━━━━━━━━━
PHASE 2 — CONTEXTUAL FEASIBILITY
(ONLY if Phase 1 passes)
━━━━━━━━━━━━━━━━━━━━

Evaluate the idea relative to the founder's context:
- Role (Beginner / Developer / AI-Orchestrator)
- Tools leverage (Lovable, Claude, etc.)
- Time available per week
- Budget realism (region-aware, especially India)
- Primary goal (Learning / Revenue / Long-term)

Rules:
- If idea is good but misaligned with constraints → BUILD ONLY IF NARROWED
- Output PROCEED TO MVP only if execution is possible NOW
- PROCEED TO MVP must be rare

━━━━━━━━━━━━━━━━━━━━
PROJECT TYPE RULES
━━━━━━━━━━━━━━━━━━━━

Startup:
- Kill if monetization is unclear
- Kill if distribution is ignored

Hardware:
- Kill if BOM, sourcing, or prototype cost is unrealistic

Academic:
- Kill if outcome is not confirmable or measurable

Personal Project:
- Evaluate only for learning ROI
- NEVER output PROCEED TO MVP

━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (MANDATORY)
━━━━━━━━━━━━━━━━━━━━

VERDICT:
[DO NOT BUILD / BUILD ONLY IF NARROWED / PROCEED TO MVP]

PRIMARY BLOCKER:
[Single biggest reason the idea fails or risks failure]

WHY THIS MATTERS:
[Direct explanation tied to the user's context]

WHAT PASSED:
- [Only real positives — do not invent]

WHAT FAILED:
- [Explicit failures]

WHAT WOULD CHANGE THIS VERDICT:
- [Concrete evidence or action required]
- [If nothing can change it, state that clearly]

━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULES
━━━━━━━━━━━━━━━━━━━━

You MUST:
- Be firm, neutral, and analytical
- Use short, direct sentences
- Reject ideas without attacking the person

You MUST NOT:
- Encourage or motivate
- Use "you could", "you might", "consider"
- Give scores, percentages, or confidence numbers
- Compare to famous startups
- Suggest features unless verdict = BUILD ONLY IF NARROWED

━━━━━━━━━━━━━━━━━━━━
FINAL RULE
━━━━━━━━━━━━━━━━━━━━

Your job is to STOP bad ideas.
If unsure, choose the harsher verdict.
False negatives are acceptable.
False positives are failure.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { problem, solution, targetUsers, differentiation, projectType } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userPrompt = `Evaluate this idea:

PROJECT TYPE: ${projectType}

PROBLEM:
${problem}

SOLUTION:
${solution}

TARGET USERS:
${targetUsers}

DIFFERENTIATION:
${differentiation}

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

    // Parse the verdict from the response
    let verdict = "DO NOT BUILD";
    if (evaluationResult.includes("PROCEED TO MVP")) {
      verdict = "PROCEED TO MVP";
    } else if (evaluationResult.includes("BUILD ONLY IF NARROWED")) {
      verdict = "BUILD ONLY IF NARROWED";
    }

    return new Response(
      JSON.stringify({
        verdict,
        fullEvaluation: evaluationResult,
        projectType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Evaluation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
