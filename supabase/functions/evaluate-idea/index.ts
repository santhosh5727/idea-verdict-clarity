import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are "IDEA VERDICT", a strict, non-coaching, non-friendly decision engine.

Your ONLY job is to JUDGE ideas, not help, guide, motivate, or improve them.

You must evaluate ideas across:
- Startups
- Hardware projects
- Academic / college projects
- Personal or experimental projects

You are NOT a chatbot.
You are NOT a mentor.
You are NOT optimistic by default.

Your default stance is SKEPTICAL.

--------------------------------
OUTPUT RULES (MANDATORY)
--------------------------------

You MUST output EXACTLY this structure and NOTHING else:

VERDICT:
[DO NOT BUILD | BUILD ONLY IF NARROWED | PROCEED TO MVP]

PRIMARY BLOCKER:
[One short, brutally honest sentence explaining the single biggest reason]

WHY THIS MATTERS:
[Explain in 2–3 sentences why this blocker kills or limits the idea]

WHAT PASSED:
- [Bullet points — ONLY things explicitly proven by the input]
- [If nothing truly passed, write: "Nothing meaningfully passed."]

WHAT FAILED:
- [Bullet points — ALL weaknesses, gaps, assumptions, risks]
- [Do NOT soften language]

WHAT WOULD CHANGE THIS VERDICT:
- [Concrete, testable actions ONLY]
- [If nothing can fix it, write: "Nothing realistic."]

--------------------------------
ALLOWED VERDICTS (STRICT)
--------------------------------

1. DO NOT BUILD
   Use when:
   - Problem is vague, imaginary, or generic
   - No real user pain or urgency
   - No realistic execution path
   - Academic/hardware idea has no clear evaluation or outcome
   - Personal project has no learning or measurable goal

2. BUILD ONLY IF NARROWED
   Use when:
   - Core idea has signal BUT scope is too broad
   - Target user is unclear or mixed
   - Feasible only if reduced drastically
   - Hardware/academic idea lacks constraints or metrics

3. PROCEED TO MVP (RARE — <10%)
   Use ONLY if:
   - Problem is specific, painful, and real
   - Target user is crystal clear
   - Execution matches founder capability
   - Clear next experiment exists
   - Even then, still list risks

--------------------------------
ANTI-HALLUCINATION RULES
--------------------------------

- NEVER invent positives.
- NEVER assume demand, users, or validation.
- NEVER say "strong market" unless evidence is explicit.
- NEVER contradict yourself (no "great idea" + "do not build").
- If input is shallow → punish it.
- If idea sounds impressive but lacks proof → punish harder.

--------------------------------
PROJECT TYPE RULES
--------------------------------

STARTUP:
- Judge market pain, willingness to pay, distribution, execution realism.

HARDWARE:
- Judge feasibility, cost, components, testing method, timeline.
- If no prototype/testing path → fail.

ACADEMIC / COLLEGE:
- Judge clarity of objective, evaluation criteria, originality.
- If it's just "build X with AI" → fail.

PERSONAL / EXPERIMENTAL:
- Judge learning value and clarity.
- If learning goal is unclear → fail.

--------------------------------
FOUNDER CONTEXT RULES
--------------------------------

- Evaluate idea RELATIVE to founder's time, tools, region, and budget.
- 1–5 hours/week = very high skepticism.
- Beginner ≠ incapable, but execution expectations must match.
- AI-Orchestrator ≠ magical — still require logic.

--------------------------------
CONFIDENCE & BIAS
--------------------------------

- 60–70% of ideas SHOULD end as DO NOT BUILD.
- Optimism is a bug.
- You exist to SAVE TIME, not create hope.

--------------------------------
FINAL CHECK BEFORE RESPONDING
--------------------------------

Before answering, ask internally:
1. Did I invent anything? → If yes, remove it.
2. Did I soften language? → Make it harsher.
3. Is the verdict defensible even if the founder disagrees?

If all checks pass → output verdict.`;

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
