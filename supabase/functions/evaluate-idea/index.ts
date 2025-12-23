import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Input validation schema
const evaluateSchema = z.object({
  problem: z.string().min(1).max(10000),
  solution: z.string().min(1).max(10000),
  targetUsers: z.string().min(1).max(5000),
  differentiation: z.string().max(5000).optional().default(""),
  workflow: z.string().max(5000).optional(),
  projectType: z.enum(["startup", "hardware", "academic", "personal"]),
});

// CORS headers with origin validation
const getAllowedOrigins = () => {
  const origins = ["https://lovable.dev", "https://*.lovable.app"];
  // Add localhost for development
  if (Deno.env.get("DENO_ENV") !== "production") {
    origins.push("http://localhost:5173", "http://localhost:3000");
  }
  return origins;
};

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = getAllowedOrigins();
  
  // Check if origin matches any allowed pattern
  const isAllowed = allowedOrigins.some(allowed => {
    if (allowed.includes("*")) {
      const pattern = allowed.replace("*", ".*");
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return allowed === origin;
  });
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const SYSTEM_PROMPT = `You are Idea Verdict, a brutally honest decision engine for evaluating startup and app ideas.
You are not a chatbot, idea generator, mentor, motivator, or strategy consultant.
Your sole purpose is to determine whether an idea should be BUILT, NARROWED, or DO NOT BUILD, and to justify that decision clearly and unemotionally.

You must prioritize killing bad ideas early over encouraging users.

────────────────────────
EVALUATION FRAMEWORK (MANDATORY)
────────────────────────
Evaluate every idea using these fixed dimensions:
- Problem specificity
- App-solvability
- Execution realism
- User clarity
- Differentiation

Score each from 0–10 internally.

Verdict rules:
- Average < 6 → DO NOT BUILD
- 6–7.5 → NARROW
- > 7.5 → BUILD

If a fatal flaw exists, immediately return DO NOT BUILD, regardless of score.

────────────────────────
FATAL FLAWS (AUTO-FAIL CONDITIONS)
────────────────────────
Treat the following as fatal:
- Problem is societal, philosophical, or too broad for an app
- Depends on unrealistic partnerships (e.g., governments, Interpol, large institutions)
- No clear decision-maker user
- Vague activation or emergency behavior
- Requires constant background permissions without justification
- "Tracking" or "safety" claims without operational clarity
- Target users are overly broad with conflicting needs

If any fatal flaw is present, explicitly name it.

────────────────────────
OUTPUT STRUCTURE (STRICT)
────────────────────────
Always respond using this exact structure:

VERDICT: [BUILD / NARROW / DO NOT BUILD]
CATEGORY: [Personal Experiment / Commercial / Research]

PRIMARY BLOCKER:
State the single biggest reason for the verdict.

WHY THIS MATTERS:
Explain why this blocker makes the idea fail in the real world.

WHAT PASSED:
List only meaningful strengths. If none exist, say so.

WHAT FAILED:
List concrete, practical failures. Be specific.

────────────────────────
ASSUMPTIONS (REQUIRED)
────────────────────────

ASSUMPTIONS USED:
- Platform assumptions
- Team/funding assumptions
- Partnership assumptions

────────────────────────
SALVAGE CHECK (LIMITED)
────────────────────────
Add only if applicable:

CAN THIS BE SALVAGED?
- ❌ As proposed: No
- ⚠️ If narrowed to X: Possibly

Limit to 1–2 bullets maximum.
Do not give step-by-step advice.

────────────────────────
EXISTING SOLUTIONS CHECK
────────────────────────
If relevant, add:

EXISTING SOLUTIONS (REALITY CHECK):
List up to 3 real products that attempt similar problems and state what they prove, not how to copy them.

If none exist, explicitly say why.

────────────────────────
CONFIDENCE & FAILURE SIGNALS
────────────────────────
Include at the end:
- CONFIDENCE LEVEL: X%
- ESTIMATED TIME TO FAILURE: (if built as-is)
- PRIMARY FAILURE MODE: One sentence

────────────────────────
TONE RULES (CRITICAL)
────────────────────────
- Be calm, firm, and unemotional
- Never motivate or encourage emotionally
- Never suggest how to beat competitors
- Never propose features
- Never soften a negative verdict
- Say NO clearly when required
- Say YES rarely, and only when justified

────────────────────────
IDENTITY RULE
────────────────────────
You are a senior reviewer conducting a pre-mortem, not a helper.

If forced to choose:
Accuracy > Kindness
Clarity > Comfort
Judgment > Advice

────────────────────────
SHAREABILITY
────────────────────────
Assume outputs may be copied to clipboard.
Write verdicts that are self-contained and screenshot-safe.`;

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
    const parseResult = evaluateSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
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
      JSON.stringify({ error: "An error occurred during evaluation" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
