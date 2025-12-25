import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const buildSystemPrompt = (
  ideaProblem: string,
  verdictType: string,
  score: string,
  fullEvaluation: string
) => {
  return `You are a friendly Verdict Assistant helping users understand their startup idea evaluation.

CONTEXT - THE IDEA BEING EVALUATED:
"${ideaProblem}"

VERDICT RESULT: ${verdictType}
IDEA STRENGTH SCORE: ${score}%

FULL EVALUATION:
${fullEvaluation}

YOUR ROLE:
- Answer questions about this specific evaluation conversationally and helpfully
- Reference specific parts of the evaluation when relevant (e.g., "Looking at the Target User section...")
- Quote actual reasoning from the evaluation to back up your points
- Be conversational, not robotic - use a friendly, helpful tone
- Ask clarifying questions when needed (e.g., "Are you asking about technical feasibility or market viability?")
- Keep responses concise (2-3 paragraphs max)

STRICT RULES:
- NEVER suggest new ideas or pivots
- NEVER do re-evaluations or give new scores
- NEVER change or challenge the verdict
- ONLY discuss and explain the existing evaluation
- If asked to re-score or change verdict, politely explain the verdict is final and offer to clarify it instead

Remember: Be helpful and conversational, like a knowledgeable friend explaining the evaluation.`;
};

const parseScoreFromEvaluation = (fullEvaluation: string): string => {
  const patterns = [
    /idea\s*strength[:\s]*(\d+)%/i,
    /score[:\s]*(\d+)%/i,
    /(\d+)%\s*(?:idea\s*)?strength/i,
  ];
  
  for (const pattern of patterns) {
    const match = fullEvaluation.match(pattern);
    if (match) return match[1];
  }
  return "N/A";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    const message = body.message?.trim() || "";
    const verdictText = body.verdict_text || body.verdict || "";
    const verdictType = body.verdict_type || body.verdictType || "UNKNOWN";
    const ideaProblem = body.idea_problem || "";
    const conversationHistory = body.conversationHistory || [];
    const isFirstMessage = body.isFirstMessage || false;

    console.log("VERDICT CHAT PAYLOAD", { 
      message, 
      verdictType, 
      hasVerdictText: !!verdictText,
      hasIdeaProblem: !!ideaProblem,
      isFirstMessage 
    });

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

    // Parse score from evaluation
    const score = parseScoreFromEvaluation(verdictText);

    // Build system prompt with full context
    const systemPrompt = buildSystemPrompt(ideaProblem, verdictType, score, verdictText);

    // Build messages
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];
    
    // Add conversation history
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // For first message, generate the greeting
    if (isFirstMessage) {
      const verdictLabel = verdictType === "build" ? "BUILD" : 
                          verdictType === "narrow" ? "NARROW" : "DO NOT BUILD";
      messages.push({ 
        role: "user", 
        content: `Generate a brief, friendly greeting introducing yourself and the evaluation result. The verdict is ${verdictLabel} with a score of ${score}%. Invite them to ask questions about any part of the evaluation. Keep it to 2-3 sentences, be conversational.` 
      });
    } else {
      // Validate minimum message length for user messages
      if (message.length < 3) {
        return new Response(
          JSON.stringify({ response: "Please ask a more detailed question (at least 3 characters)." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      messages.push({ role: "user", content: message });
    }

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
