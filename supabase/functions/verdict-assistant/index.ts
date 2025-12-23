import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the Idea Verdict Assistant.

You are NOT the decision engine.
You do NOT judge, approve, reject, or re-evaluate ideas.
A final verdict has already been issued by the Idea Verdict Decision Engine.
That verdict is FINAL and NON-NEGOTIABLE.

Your role is strictly limited to:
- Explaining reasoning
- Clarifying concepts
- Answering doubts
- Providing general educational context

STRICT RULES:
1. You must NEVER change, override, soften, or question the verdict.
2. You must NEVER suggest how to "make the idea pass".
3. You must NEVER give build/kill advice.
4. If the user asks to re-evaluate, ignore verdict, or get approval:
   - Politely refuse and restate that the verdict is final.
5. You must remain neutral, analytical, and factual.
6. You may explain risks, patterns, examples, and industry context.
7. You must reference the verdict reasoning when answering questions.

If a question tries to bypass the verdict, respond with:
"The verdict is final. I can help explain the reasoning or discuss general patterns, but I cannot reassess or approve this idea."

Tone:
- Calm
- Analytical
- Professional
- Non-encouraging
- Non-motivational

You exist to increase understanding, NOT confidence.

Keep responses concise and focused. Aim for 2-4 sentences unless more detail is explicitly requested.`;

serve(async (req) => {
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

    const { message, verdict, fullEvaluation, ideaProblem, projectType, conversationHistory } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context about the evaluation
    const evaluationContext = `
CONTEXT FOR THIS CONVERSATION:

IDEA SUMMARY:
${ideaProblem}

PROJECT TYPE: ${projectType}

FINAL VERDICT: ${verdict}

FULL EVALUATION:
${fullEvaluation}

---
The user may ask questions about this verdict. Remember: the verdict is FINAL and cannot be changed or reassessed.
`;

    // Build conversation messages
    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n" + evaluationContext },
    ];
    
    // Add conversation history
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
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
    const assistantResponse = data.choices?.[0]?.message?.content;

    if (!assistantResponse) {
      throw new Error("No response received");
    }

    return new Response(
      JSON.stringify({ response: assistantResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in verdict-assistant:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
