import { useState } from "react";
import { Sparkles, Send, Loader2, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface StructuredIdea {
  problem: string;
  solution: string;
  targetUsers: string;
  differentiation: string;
  workflow: string;
}

const NovaAssistant = () => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [rawIdea, setRawIdea] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [structuredIdea, setStructuredIdea] = useState<StructuredIdea | null>(null);

  const MIN_LENGTH = 100; // Minimum characters for idea description
  const ideaLength = rawIdea.trim().length;
  const canSubmit = ideaLength >= MIN_LENGTH;

  const handleStructure = async () => {
    if (!canSubmit) return;

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("nova-structure", {
        body: { idea: rawIdea.trim() },
      });

      if (error) {
        console.error("Nova error:", error);
        if (error.message?.includes("429")) {
          toast.error("Rate limit exceeded. Please try again in a moment.");
        } else if (error.message?.includes("402")) {
          toast.error("AI credits exhausted. Please add funds to continue.");
        } else {
          toast.error("Failed to structure idea. Please try again.");
        }
        return;
      }

      if (data?.structured) {
        setStructuredIdea(data.structured);
      } else {
        toast.error("Failed to structure idea. Please try again.");
      }
    } catch (err) {
      console.error("Nova processing error:", err);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProceed = () => {
    if (!structuredIdea) return;
    
    // Navigate to evaluate with pre-filled data
    navigate("/evaluate", {
      state: {
        prefilled: {
          problem: structuredIdea.problem,
          solution: structuredIdea.solution,
          targetUsers: structuredIdea.targetUsers,
          differentiation: structuredIdea.differentiation,
          workflow: structuredIdea.workflow,
        },
      },
    });
  };

  const handleReset = () => {
    setStructuredIdea(null);
    setRawIdea("");
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8 sm:mt-12">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90 hover:border-primary/30 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-foreground">Nova — Idea Structuring Assistant</span>
            <p className="text-xs text-muted-foreground">Let AI help structure your raw idea</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm p-4 sm:p-5 shadow-card">
          {!structuredIdea ? (
            <>
              {/* Input Phase */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  What's your idea?
                </label>
                <p className="text-xs text-muted-foreground mb-3">
                  Describe it in detail (at least 5 lines). Nova will structure it for evaluation.
                </p>
                <Textarea
                  value={rawIdea}
                  onChange={(e) => setRawIdea(e.target.value)}
                  placeholder="I want to build an app that helps people..."
                  className="min-h-[140px] resize-none rounded-lg border-border/50 bg-background/50 text-sm focus:border-primary/50"
                  disabled={isProcessing}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs ${canSubmit ? "text-muted-foreground" : "text-warning"}`}>
                    {ideaLength} / {MIN_LENGTH} characters minimum
                  </span>
                  <Button
                    onClick={handleStructure}
                    disabled={!canSubmit || isProcessing}
                    size="sm"
                    className="gap-2 rounded-lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Structuring...
                      </>
                    ) : (
                      <>
                        <Send className="h-3 w-3" />
                        Structure with Nova
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Output Phase */}
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Structured by Nova
                  </h4>
                  <button
                    onClick={handleReset}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Start Over
                  </button>
                </div>

                {/* Problem */}
                <div className="rounded-lg bg-background/50 p-3 border border-border/30">
                  <label className="text-xs font-medium text-primary uppercase tracking-wider">Problem</label>
                  <p className="text-sm text-foreground mt-1">{structuredIdea.problem}</p>
                </div>

                {/* Solution */}
                <div className="rounded-lg bg-background/50 p-3 border border-border/30">
                  <label className="text-xs font-medium text-primary uppercase tracking-wider">Solution</label>
                  <p className="text-sm text-foreground mt-1">{structuredIdea.solution}</p>
                </div>

                {/* Target Users */}
                <div className="rounded-lg bg-background/50 p-3 border border-border/30">
                  <label className="text-xs font-medium text-primary uppercase tracking-wider">Target Users</label>
                  <p className="text-sm text-foreground mt-1">{structuredIdea.targetUsers}</p>
                </div>

                {/* Differentiation */}
                <div className="rounded-lg bg-background/50 p-3 border border-border/30">
                  <label className="text-xs font-medium text-primary uppercase tracking-wider">Differentiation</label>
                  <p className="text-sm text-foreground mt-1">{structuredIdea.differentiation}</p>
                </div>

                {/* Workflow */}
                <div className="rounded-lg bg-background/50 p-3 border border-border/30">
                  <label className="text-xs font-medium text-primary uppercase tracking-wider">Workflow</label>
                  <p className="text-sm text-foreground mt-1">{structuredIdea.workflow}</p>
                </div>

                {/* Proceed Button */}
                <Button
                  onClick={handleProceed}
                  className="w-full gap-2 rounded-lg shadow-md hover:shadow-lg transition-all hover:scale-[1.01] mt-4"
                >
                  Proceed with this Structure
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  You can edit all fields before evaluation
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NovaAssistant;
