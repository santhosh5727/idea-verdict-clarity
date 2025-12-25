import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MessageCircle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

interface VerdictChatAssistantProps {
  verdict: string;
  fullEvaluation: string;
  ideaProblem: string;
  projectType: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

type VerdictCategory = "build" | "narrow" | "kill";

const getVerdictCategory = (verdict: string): VerdictCategory => {
  const v = verdict.toLowerCase();
  if (v.includes("build") && !v.includes("not") && !v.includes("don")) return "build";
  if (v.includes("narrow") || v.includes("pivot")) return "narrow";
  return "kill";
};

const CONVERSATION_STARTERS: Record<VerdictCategory, string[]> = {
  kill: [
    "What's the main reason this got a low score?",
    "Is there anything salvageable here?",
    "What did I miss in my evaluation?",
  ],
  narrow: [
    "What's the biggest weakness?",
    "How can I improve this specific aspect?",
    "What would push this to BUILD?",
  ],
  build: [
    "What's my biggest risk?",
    "What should I focus on first?",
    "Are there any red flags I should watch?",
  ],
};

const VerdictChatAssistant = ({
  verdict,
  fullEvaluation,
  ideaProblem,
  projectType,
}: VerdictChatAssistantProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const verdictCategory = getVerdictCategory(verdict);
  const conversationStarters = CONVERSATION_STARTERS[verdictCategory];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send first greeting message when chat opens
  const sendGreeting = useCallback(async () => {
    if (hasGreeted || !fullEvaluation) return;
    
    setLoading(true);
    setHasGreeted(true);

    try {
      const { data, error } = await supabase.functions.invoke("verdict-assistant", {
        body: {
          message: "",
          verdict_text: fullEvaluation,
          verdict_type: verdict,
          idea_problem: ideaProblem,
          conversationHistory: [],
          isFirstMessage: true,
        },
      });

      if (error) throw error;

      if (data.response) {
        setMessages([{ role: "assistant", content: data.response }]);
      }
    } catch (error) {
      logError("Greeting error:", error);
      // Fallback greeting if API fails
      const score = parseScore(fullEvaluation);
      const verdictLabel = verdictCategory === "build" ? "BUILD" : 
                          verdictCategory === "narrow" ? "NARROW" : "DO NOT BUILD";
      setMessages([{
        role: "assistant",
        content: `Hey! I just evaluated your idea and gave it a ${score}% with a '${verdictLabel}' verdict. Want to talk through any part of the evaluation? I can explain the reasoning or answer questions about specific areas.`
      }]);
    } finally {
      setLoading(false);
    }
  }, [hasGreeted, fullEvaluation, verdict, ideaProblem, verdictCategory]);

  // Parse score from evaluation text
  const parseScore = (text: string): string => {
    const patterns = [
      /idea\s*strength[:\s]*(\d+)%/i,
      /score[:\s]*(\d+)%/i,
      /(\d+)%\s*(?:idea\s*)?strength/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return "N/A";
  };

  // Trigger greeting when chat opens
  useEffect(() => {
    if (isOpen && !hasGreeted && messages.length === 0) {
      sendGreeting();
    }
  }, [isOpen, hasGreeted, messages.length, sendGreeting]);

  const sendMessage = async (messageText?: string) => {
    const userMessage = (messageText || input).trim();
    
    if (userMessage.length < 3 || loading) return;

    if (!fullEvaluation) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "assistant", content: "I don't have the verdict context. Please refresh the page." },
      ]);
      setInput("");
      return;
    }

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("verdict-assistant", {
        body: {
          message: userMessage,
          verdict_text: fullEvaluation,
          verdict_type: verdict,
          idea_problem: ideaProblem,
          conversationHistory: messages,
          isFirstMessage: false,
        },
      });

      if (error) throw error;

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      }
    } catch (error) {
      logError("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Chat unavailable. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    sendMessage(suggestion);
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        aria-label="Open chat assistant"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[calc(100vw-48px)] max-w-md rounded-xl border border-border/60 bg-card shadow-2xl sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div>
              <h3 className="font-semibold text-foreground">Verdict Assistant</h3>
              <p className="text-xs text-muted-foreground">
                Let's discuss your evaluation
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="h-72 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start items-center gap-2">
                <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Typing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Conversation Starters */}
          {messages.length > 0 && messages.length <= 2 && !loading && (
            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground mb-2">Suggested questions:</p>
              <div className="flex flex-wrap gap-1.5">
                {conversationStarters.map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(starter)}
                    className="text-xs px-2.5 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border/40 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your verdict..."
                className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
              <Button
                size="icon"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VerdictChatAssistant;
