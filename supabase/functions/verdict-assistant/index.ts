import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a Verdict Assistant.

You DO NOT judge ideas.
You DO NOT change verdicts.
You ONLY explain, clarify, and answer questions based on the EXISTING verdict text.

Rules:
- Never reassess the idea
- Never suggest BUILD if verdict is negative
- Explain failures in simple language
- Answer doubts concisely and clearly
- If the user asks emotional or vague questions, redirect to concrete reasons from the verdict.

The verdict is FINAL and cannot be changed. You exist to help users understand the verdict, not to challenge it.

Keep responses concise (2-4 sentences) unless more detail is requested.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    const message = body.message?.trim() || "";
    const verdictText = body.verdict_text || body.verdict || "";
    const verdictType = body.verdict_type || body.verdictType || "UNKNOWN";
    const conversationHistory = body.conversationHistory || [];

    console.log("VERDICT CHAT PAYLOAD", { message, verdictType, hasVerdictText: !!verdictText });

    // Validate minimum message length
    if (message.length < 3) {
      return new Response(
        JSON.stringify({ response: "Please ask a more detailed question (at least 3 characters)." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate verdict exists
    if (!verdictText) {
      return new Response(
        JSON.stringify({ response: "I don't have the verdict context. Please refresh the page and try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Chat unavailable. Please try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context
    const evaluationContext = `
VERDICT CONTEXT:
Verdict Type: ${verdictType}
Full Verdict:
${verdictText}

---
Answer questions about this verdict. Remember: the verdict is FINAL.
`;

    // Build messages
    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n" + evaluationContext },
    ];
    
    // Add conversation history
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
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
          JSON.stringify({ error: "Rate limits exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Chat unavailable. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const assistantResponse = data.choices?.[0]?.message?.content;

    if (!assistantResponse) {
      return new Response(
        JSON.stringify({ error: "Chat unavailable. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ response: assistantResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in verdict-assistant:", error);
    return new Response(
      JSON.stringify({ error: "Chat unavailable. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
