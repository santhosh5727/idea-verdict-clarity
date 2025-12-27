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

1. MARKET REALITY CHECK (Weight: 30%)
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
PROJECT TYPE CLASSIFICATION
━━━━━━━━━━━━━━━━━━

Classify into ONE primary type:
1. B2B SaaS - Software sold to businesses (subscription model)
2. B2C SaaS - Software sold to consumers (subscription/freemium)
3. Marketplace - Two-sided platform connecting buyers and sellers
4. E-commerce - Selling physical/digital products directly
5. Service Business - Providing services (agency, consulting)
6. Hardware - Physical products or hardware+software combo
7. AI/ML Product - AI-powered tool or service
8. Developer Tool - Tools for developers/technical users
9. Content/Media - Content creation, publishing, media platform
10. Mobile App - Mobile-first consumer application
11. Fintech - Financial services or payment product
12. Health Tech - Healthcare, fitness, wellness product
13. Education - Learning, training, education platform
14. Productivity - Tools for productivity, organization, workflow
15. Social/Community - Social network or community platform
16. Enterprise - Large enterprise-focused solution
17. Local/Regional - Location-based or local service
18. Gaming - Games or gaming-adjacent product
19. Other - Doesn't fit standard categories

━━━━━━━━━━━━━━━━━━
EVALUATION LENS MODIFIERS
━━━━━━━━━━━━━━━━━━

Indie / Micro-SaaS Lens:
- Boost: Low execution difficulty (+10%), Solo-founder-friendly (+10%), Fast to market (+5%)
- Penalize: Requires network effects (-15%), Needs large team (-20%), High CAC required (-10%)
- Ideal Range: 60-85% (Most indie ideas shouldn't score 90%+ as they're deliberately small)

VC-Backed / High-Growth Lens:
- Boost: Huge TAM (+15%), Network effects (+15%), Winner-take-all dynamics (+10%)
- Penalize: Small market (-20%), Linear scaling only (-15%), Lifestyle business dynamics (-10%)
- Ideal Range: 40-95% (Higher variance, most shouldn't get funded)

━━━━━━━━━━━━━━━━━━
SCORING ALGORITHM
━━━━━━━━━━━━━━━━━━

1. Calculate Base Score:
   Base Score = (Market x 0.30) + (Problem-Solution x 0.25) + (Moat x 0.20) + (Execution x 0.15) + (Business Model x 0.10)

2. Apply Lens Modifiers: Adjust based on lens-specific factors

3. Reality Check:
   - If score >85%, ask: "Would this get funded by YC/a16z?"
   - If score <25%, ask: "Is there ANY redeeming quality?"
   - If score is 35-45%, strongly consider pushing it lower or higher (avoid the dead zone)

4. Assign Verdict (STRICT - NON-NEGOTIABLE):
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

VIABILITY SCORE
[X]

VERDICT
[BUILD / NARROW / RETHINK / DO NOT BUILD]
[One powerful sentence capturing the core verdict - make it memorable and direct]

PROJECT TYPE
[Primary Type] - Sub-category: [Specific niche]
[One sentence explaining why this classification fits]

DETECTED CATEGORY
[Category from the list above]

EXECUTION DIFFICULTY (MANDATORY - must always be assessed)
[EASY / MEDIUM / HARD]
Assessment factors: technical complexity, integrations required, regulatory burden, external dependencies, team specialization needed
[One sentence justification]
Estimated team size: [X people]
Estimated timeline: [X weeks/months]

KEY STRENGTHS
1. [Strength Title]: [Specific explanation with evidence or reasoning - 2-3 sentences]
2. [Strength Title]: [Specific explanation with evidence or reasoning - 2-3 sentences]
3. [Strength Title]: [Specific explanation with evidence or reasoning - 2-3 sentences]

CRITICAL WEAKNESSES
1. [Weakness Title]: [Specific explanation of the problem and why it matters - 2-3 sentences]
2. [Weakness Title]: [Specific explanation of the problem and why it matters - 2-3 sentences]
3. [Weakness Title]: [Specific explanation of the problem and why it matters - 2-3 sentences]

REALITY CHECK
[3-4 sentences of brutally honest assessment answering:
- What's the single biggest reason this could fail?
- What assumption is the founder making that's probably wrong?
- What does the founder not know that they desperately need to learn?
- If you had to bet $10k of your own money on this, would you? Why or why not?]

SIMILAR PROJECTS AND COMPETITORS

Direct Competitors:
1. [Company Name] ([website]) - [How they're similar - 1 sentence]
2. [Company Name] ([website]) - [How they're similar - 1 sentence]
3. [Company Name] ([website]) - [How they're similar - 1 sentence]

Adjacent/Inspirational:
- [Company Name] ([website]) - [What to learn from them - 1 sentence]
- [Company Name] ([website]) - [What to learn from them - 1 sentence]

Why they matter: [2 sentences explaining what these competitors prove about the market and what the founder should learn from them]

THE HARSH TRUTH
[3-5 sentences of the absolute truth the founder needs to hear but probably doesn't want to. Be specific, direct, and actionable. This should sting but be helpful. Examples:
- "Your idea is just [competitor] with a prettier interface - that's not enough."
- "You're solving a problem that only exists in your imagination."
- "This market is a graveyard of failed startups - you need an unfair advantage to survive."
- "You're underestimating execution difficulty by at least 5x."
- "No one will pay for this when free alternatives exist."]

WHAT YOU MUST DO TO IMPROVE

Immediate Actions (This Week):
1. [Specific Action]: [Exactly what to do and why - 2 sentences]
2. [Specific Action]: [Exactly what to do and why - 2 sentences]
3. [Specific Action]: [Exactly what to do and why - 2 sentences]

Short-term Focus (Next 30 Days):
1. [Specific Goal]: [What success looks like - 2 sentences]
2. [Specific Goal]: [What success looks like - 2 sentences]

Long-term Strategy (3-6 Months):
1. [Strategic Shift]: [The big change needed - 2 sentences]

Pivot Suggestions (if score <70%):
- Option 1: [Specific pivot direction - why it's better - 2 sentences]
- Option 2: [Alternative pivot direction - why it's better - 2 sentences]

FACTOR BREAKDOWN

Market Opportunity: [X]/100 - [One sentence: What's right/wrong with the market]
Problem-Solution Fit: [X]/100 - [One sentence: How well does this solve the problem]
Competitive Moat: [X]/100 - [One sentence: What's defensible here]
Execution Reality: [X]/100 - [One sentence: How hard is this to build]
Business Model: [X]/100 - [One sentence: How will you make money]

Overall Assessment: [2-3 sentences synthesizing the scores and explaining the final verdict]

━━━━━━━━━━━━━━━━━━
CRITICAL RULES (NEVER VIOLATE)
━━━━━━━━━━━━━━━━━━

1. No Default Scores: Every idea MUST be evaluated independently. Scores clustering around one number means you're broken.

2. Use Full Range: Distribute scores across 0-100. Most ideas should fall in 40-70% range. <30% and >85% should be rare.

3. Be Brutally Honest: Founders need truth, not encouragement. If an idea is bad, say so clearly in "The Harsh Truth" section.

4. Specificity Wins: Never say "improve marketing" - say "Run 10 customer interviews in week 1 to validate problem severity"

5. Context is King: Same idea can be 85% for indie founders and 45% for VC-backing. Apply lens correctly.

6. Find Real Competitors: Always list 3-5 actual competitors with real websites. If you can't find any, that's either a red flag (no market) or an opportunity (untapped market).

7. Make "Harsh Truth" Sting: This section should be uncomfortable but helpful. Don't hold back.

8. Actionable Steps Only: Every action item must be specific enough that someone could do it today.

9. Compare to Reality: Constantly ask "How does this compare to [successful company] at their start?"

10. No Participation Trophies: Don't inflate scores to be nice. 50% is not the middle - it's "this probably won't work."

━━━━━━━━━━━━━━━━━━
CALIBRATION REFERENCE
━━━━━━━━━━━━━━━━━━

Score 95% - Stripe in 2010: Payments broken, huge TAM, developers hated existing options, first to nail developer experience
Score 82% - Notion in 2016: Knowledge management huge but crowded, existing tools fragmented, network effects + design
Score 68% - Yet another project management tool: Large but saturated market, incremental improvement only, easily copied
Score 45% - AI-powered horoscope app: Niche, limited willingness to pay, entertainment not real problem, no defensibility
Score 18% - Social network for left-handed people: Tiny market, not a real problem, no monetization path

Your Mission: Every evaluation could save or make a founder's career. Be the honest friend who tells them the truth, not the polite acquaintance who says "sounds interesting" to everything.

Remember: A harsh truth today saves months of wasted effort tomorrow. Your job is to be RIGHT, not to be NICE.`;
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

    // Parse EXECUTION DIFFICULTY (MANDATORY - always assessed)
    const difficultyMatch = evaluationResult.match(/EXECUTION DIFFICULTY[^:]*:\s*(EASY|MEDIUM|HARD)/i);
    // Default to MEDIUM if not found (should always be present per prompt)
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

    // Deterministic verdict based on viability score (STRICT bands - NON-NEGOTIABLE)
    // >65: BUILD, 41-65: NARROW, 31-40: RETHINK, 0-30: DO NOT BUILD (KILL)
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
      console.log(`Deterministic verdict: viability=${viabilityScore}%, difficulty=${executionDifficulty}, category=${inferredCategory}, mode=${inferredExecutionMode} → ${verdict}`);
    } else {
      verdict = "DO NOT BUILD";
      const verdictMatch = evaluationResult.match(/VERDICT:\s*(NARROW|RETHINK|BUILD|DO NOT BUILD|KILL)/i);
      if (verdictMatch) {
        const rawVerdict = verdictMatch[1].toUpperCase();
        verdict = rawVerdict === "KILL" ? "DO NOT BUILD" : rawVerdict;
      } else if (evaluationResult.includes("NARROW")) {
        verdict = "NARROW";
      } else if (evaluationResult.includes("RETHINK")) {
        verdict = "RETHINK";
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
