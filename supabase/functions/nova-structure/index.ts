import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Nova, an idea structuring assistant for IdeaVerdict.

Your ONLY job is to take a raw, unstructured idea description and convert it into a clean, structured format.

You do NOT:
- Give verdicts or judgments
- Score ideas
- Provide opinions on viability
- Add hype or discouragement

You DO:
- Extract and clarify the core problem
- Identify the proposed solution
- Define target users clearly
- Articulate differentiation points
- Outline the workflow/mechanism

RESPONSE FORMAT (JSON only):
{
  "problem": "A clear, 2-3 sentence description of the problem being solved",
  "solution": "A concise description of the proposed solution (2-3 sentences)",
  "targetUsers": "Who specifically will use this (be specific about demographics/roles)",
  "differentiation": "What makes this unique compared to existing solutions",
  "workflow": "How the solution works step-by-step in the real world"
}

Guidelines:
- Keep language neutral and practical
- Don't add features the user didn't mention
- Don't assume business models
- Be concise but complete
- If information is missing, make reasonable inferences but stay close to what was described

IMPORTANT: Return ONLY valid JSON, no markdown, no explanations.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea } = await req.json();

    if (!idea || typeof idea !== "string" || idea.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Please provide a more detailed idea description" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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
          { role: "user", content: `Structure this idea:\n\n${idea.trim()}` },
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
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content received from AI");
    }

    // Parse the JSON response
    let structured;
    try {
      // Clean up potential markdown formatting
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      structured = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse structured idea");
    }

    // Validate the response has required fields
    const requiredFields = ["problem", "solution", "targetUsers", "differentiation", "workflow"];
    for (const field of requiredFields) {
      if (!structured[field] || typeof structured[field] !== "string") {
        structured[field] = "";
      }
    }

    return new Response(
      JSON.stringify({ structured }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Nova error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to structure idea. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
