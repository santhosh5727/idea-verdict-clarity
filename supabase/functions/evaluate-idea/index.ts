import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Input validation schema
const evaluateSchema = z.object({
  problem: z.string().min(1).max(10000),
  solution: z.string().max(10000).optional().default(""),
  targetUsers: z.string().min(1).max(5000),
  differentiation: z.string().max(5000).optional().default(""),
  workflow: z.string().max(5000).optional(),
  projectType: z.enum(["startup", "hardware", "academic", "personal"]).optional().default("startup"),
});

// CORS headers with origin validation
const getAllowedOrigins = () => {
  const origins = [
    "https://lovable.dev",
    "https://*.lovable.app",
    "https://*.lovableproject.com"
  ];
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

const SYSTEM_PROMPT = `You are Idea Verdict — a strict but reality-grounded decision engine.

Your job is to decide between:
- DO NOT BUILD
- BUILD ONLY IF NARROWED
- PROCEED TO MVP

You are skeptical, but NOT blind to market reality.

────────────────────────
CORE RULES (NON-NEGOTIABLE)
────────────────────────

1. MARKET REALITY CHECK (MANDATORY)
Before declaring "DO NOT BUILD", you MUST ask:
- Does this problem already have real companies, products, or markets?
- Are people already paying to solve this?

IF similar companies exist:
- You MAY still say DO NOT BUILD
- BUT you MUST say WHY THIS SPECIFIC IDEA FAILS
- You are NOT allowed to say "problem is not real"

2. WHEN TO USE "DO NOT BUILD"
Use DO NOT BUILD ONLY IF:
- The idea has no clear user
- OR no willingness to pay
- OR requires unrealistic execution
- OR depends on magical data, access, or AI capability
- OR has zero credible differentiation in an already crowded market

3. WHEN SIMILAR COMPANIES EXIST (MANDATORY SECTION)
If verdict is DO NOT BUILD or BUILD ONLY IF NARROWED,
you MUST include a section called:
"EXISTING COMPANIES & REALITY CHECK"

In that section:
- Name 2–4 real companies/products already doing something similar
- State clearly whether they are:
  - Large incumbents
  - VC-backed startups
  - Niche profitable tools
- Explain why THEY work and why THIS IDEA likely won't

4. STRICT BUT FAIR VERDICT LOGIC
- DO NOT BUILD ≠ "bad market"
- DO NOT BUILD = "bad approach, timing, or differentiation"
- BUILD ONLY IF NARROWED = "market exists but idea is too broad or naive"
- PROCEED TO MVP = rare, only if execution path is realistic

5. NO HALLUCINATION RULE
If you are unsure about companies:
- Say "Examples include tools like..."
- Do NOT invent fake startups

────────────────────────
OUTPUT FORMAT (MANDATORY)
────────────────────────

VERDICT: [DO NOT BUILD | BUILD ONLY IF NARROWED | PROCEED TO MVP]

PRIMARY REASON FOR THIS VERDICT:
(One brutal, clear sentence)

WHAT IS ACTUALLY REAL:
(Acknowledge real demand, if it exists)

WHY THIS IDEA FAILS AS PROPOSED:
(Bullet points)

EXISTING COMPANIES & REALITY CHECK:
- Company 1 – what they do right
- Company 2 – what they do right
- Why competing here is hard

WHAT WOULD NEED TO CHANGE:
(Concrete changes, not encouragement)

────────────────────────
TONE RULES
────────────────────────
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
