import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw, Loader2, Copy, Check, Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import VerdictChatAssistant from "@/components/VerdictChatAssistant";
import IdeaStrengthMeter from "@/components/IdeaStrengthMeter";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { getDefinitiveVerdict, getVerdictConfig } from "@/lib/verdictUtils";

interface EvaluationResult {
  verdict: string;
  fullEvaluation: string;
  viabilityScore?: number;
  executionDifficulty?: string;
  inferredCategory?: string;
  inferredExecutionMode?: string;
  hasAsymmetricUpside?: boolean;
  asymmetricUpsideReason?: string;
}

interface EvaluationInputs {
  projectType?: string;
  projectName?: string;
  problem: string;
  solution: string;
  targetUsers: string;
  differentiation: string;
  workflow?: string;
  inferredCategory?: string;
  inferredExecutionMode?: string;
}


const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const evaluationId = searchParams.get("id");
  const state = location.state as { evaluation: EvaluationResult; inputs: EvaluationInputs } | null;
  
  const [loading, setLoading] = useState(!!evaluationId);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(state?.evaluation || null);
  const [inputs, setInputs] = useState<EvaluationInputs | null>(state?.inputs || null);
  const [copied, setCopied] = useState(false);
  const [dbEvaluationId, setDbEvaluationId] = useState<string | null>(evaluationId);

  const handleCopyResult = async () => {
    if (!evaluation) return;
    
    const copyText = evaluation.fullEvaluation;
    
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      toast.success("Result copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleEditAndReEvaluate = () => {
    if (!inputs) return;
    
    navigate("/evaluate", {
      state: {
        editData: {
          projectType: inputs.projectType || "",
          projectName: inputs.projectName || "",
          problem: inputs.problem,
          solution: inputs.solution,
          targetUsers: inputs.targetUsers,
          differentiation: inputs.differentiation,
          workflow: inputs.workflow || "",
          evaluationId: dbEvaluationId,
        },
      },
    });
  };

  useEffect(() => {
    if (evaluationId && !state?.evaluation) {
      // Fetch from database
      const fetchEvaluation = async () => {
        const { data, error } = await supabase
          .from("evaluations")
          .select("*")
          .eq("id", evaluationId)
          .maybeSingle();
        
        if (error || !data) {
          setLoading(false);
          return;
        }
        
        setEvaluation({
          verdict: data.verdict_type,
          fullEvaluation: data.full_verdict_text,
          inferredCategory: data.inferred_category || data.project_type,
        });
        setInputs({
          projectName: data.project_name || "",
          problem: data.idea_problem,
          solution: data.solution || "",
          targetUsers: data.target_user,
          differentiation: data.differentiation || "",
          workflow: data.workflow || "",
          inferredCategory: data.inferred_category || data.project_type,
        });
        setDbEvaluationId(data.id);
        setLoading(false);
      };
      fetchEvaluation();
    }
  }, [evaluationId, state]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-primary/8 via-primary/3 to-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to evaluate if no result data
  if (!evaluation) {
    return <Navigate to="/evaluate" replace />;
  }

  // Use single source of truth for verdict (derived from score when available)
  const definitiveVerdictType = getDefinitiveVerdict(evaluation!.fullEvaluation, evaluation!.verdict);
  const verdictConfig = getVerdictConfig(definitiveVerdictType);
  const VerdictIcon = verdictConfig.icon;

  // Parse the full evaluation into sections
  const parseEvaluation = (text: string) => {
    const sections: { title: string; content: string }[] = [];
    
    const sectionPatterns = [
      { key: "PRIMARY REASON:", title: "Primary Reason" },
      { key: "PRIMARY BLOCKER:", title: "Primary Blocker" },
      { key: "WHY THIS MATTERS:", title: "Why This Matters" },
      { key: "NEGATIVE GATES TRIGGERED:", title: "Negative Gates Triggered" },
      { key: "STRENGTHS:", title: "Strengths" },
      { key: "WHAT PASSED:", title: "What Passed" },
      { key: "CRITICAL WEAKNESSES:", title: "Critical Weaknesses" },
      { key: "WHAT FAILED:", title: "What Failed" },
      { key: "COMPETITIVE LANDSCAPE:", title: "Competitive Landscape" },
      { key: "EXISTING COMPANIES & REALITY CHECK:", title: "Existing Companies & Reality Check" },
      { key: "**EXISTING COMPANIES & REALITY CHECK:**", title: "Existing Companies & Reality Check" },
      { key: "WHAT NEEDS TO CHANGE FOR THIS TO WORK:", title: "What Needs to Change" },
      { key: "**WHAT NEEDS TO CHANGE FOR THIS TO WORK:**", title: "What Needs to Change" },
      { key: "WHAT NEEDS TO CHANGE:", title: "What Needs to Change" },
      { key: "HARSH TRUTH:", title: "Harsh Truth" },
      { key: "WHAT WOULD CHANGE THIS VERDICT:", title: "What Would Change This Verdict" },
    ];

    let remainingText = text;
    
    // Remove header lines from the text
    remainingText = remainingText.replace(/VERDICT:\s*\n?[^\n]*\n?/i, "");
    remainingText = remainingText.replace(/PROJECT TYPE:\s*\n?[^\n]*\n?/i, "");
    remainingText = remainingText.replace(/VIABILITY SCORE:\s*\n?[^\n]*\n?/i, "");
    remainingText = remainingText.replace(/IDEA STRENGTH SCORE:\s*\n?[^\n]*\n?/i, "");
    remainingText = remainingText.replace(/EXECUTION DIFFICULTY:\s*\n?[^\n]*\n?/i, "");

    sectionPatterns.forEach((pattern) => {
      const startIndex = remainingText.indexOf(pattern.key);
      if (startIndex !== -1) {
        // Find the next section start
        let endIndex = remainingText.length;
        for (const nextPattern of sectionPatterns) {
          if (nextPattern.key === pattern.key) continue;
          const nextStart = remainingText.indexOf(nextPattern.key, startIndex + pattern.key.length);
          if (nextStart !== -1 && nextStart < endIndex) {
            endIndex = nextStart;
          }
        }
        
        let content = remainingText
          .substring(startIndex + pattern.key.length, endIndex)
          .trim();
        
        // Clean up markdown formatting
        content = content.replace(/^\*\*|\*\*$/g, '').trim();
        
        // Format content for better readability
        content = formatSectionContent(content);
        
        if (content && !sections.find(s => s.title === pattern.title)) {
          sections.push({ title: pattern.title, content });
        }
      }
    });

    return sections;
  };

  // Format section content with proper punctuation and structure
  const formatSectionContent = (content: string): string => {
    // Split by line breaks or bullet points
    const lines = content.split(/\n+/).filter(line => line.trim());
    
    if (lines.length <= 1) {
      return content;
    }
    
    // Format each line as a bullet point if it looks like a list
    const formattedLines = lines.map((line, index) => {
      let cleaned = line.trim();
      // Remove existing bullets, dashes, or numbers at start
      cleaned = cleaned.replace(/^[-•*]\s*/, '');
      cleaned = cleaned.replace(/^\d+[.)]\s*/, '');
      
      // Add colon after first phrase if it looks like a heading
      if (cleaned.includes(' ') && !cleaned.includes(':') && cleaned.length < 80) {
        const words = cleaned.split(' ');
        if (words.length >= 2 && words.length <= 6) {
          // Check if first few words are capitalized (likely a heading)
          const firstPart = words.slice(0, Math.min(3, words.length)).join(' ');
          if (/^[A-Z]/.test(firstPart)) {
            // It might be a heading, leave as is or add pointer
            return `• ${cleaned}`;
          }
        }
      }
      
      return `• ${cleaned}`;
    });
    
    return formattedLines.join('\n');
  };

  // Generate a summary from the evaluation
  const generateSummary = (text: string, verdictType: string): string => {
    // Extract key points for summary
    const primaryReasonMatch = text.match(/PRIMARY REASON:\s*([^\n]+)/i);
    const harshTruthMatch = text.match(/HARSH TRUTH:\s*([^\n]+)/i);
    
    const primaryReason = primaryReasonMatch ? primaryReasonMatch[1].trim() : "";
    const harshTruth = harshTruthMatch ? harshTruthMatch[1].trim() : "";
    
    if (primaryReason && harshTruth) {
      return `${primaryReason}\n\n${harshTruth}`;
    } else if (primaryReason) {
      return primaryReason;
    } else if (harshTruth) {
      return harshTruth;
    }
    
    // Fallback: extract first meaningful paragraph
    const paragraphs = text.split(/\n\n+/).filter(p => 
      p.trim() && 
      !p.includes('VERDICT:') && 
      !p.includes('SCORE:') &&
      p.length > 50
    );
    
    return paragraphs[0]?.trim() || "";
  };

  const evaluationSections = parseEvaluation(evaluation!.fullEvaluation);
  const summaryText = generateSummary(evaluation!.fullEvaluation, definitiveVerdictType);

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-3 flex-shrink-0">
            <img 
              src={logo} 
              alt="Idea Verdict" 
              className="h-14 md:h-16 w-auto"
              style={{ filter: 'hue-rotate(-10deg)' }}
            />
          </Link>

          <Link
            to="/dashboard"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex-shrink-0"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="bg-gradient-to-r from-primary/8 via-primary/3 to-background min-h-[calc(100vh-64px)]">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 md:py-12">
          <div className="mx-auto max-w-3xl">
            {/* Project Name Header */}
            {inputs?.projectName && (
              <div className="mb-4 text-center">
                <h2 className="text-lg font-semibold text-foreground">{inputs.projectName}</h2>
              </div>
            )}

            {/* Verdict Card */}
            <div className={`mb-6 sm:mb-8 rounded-xl border ${verdictConfig.borderColor} bg-card/90 backdrop-blur-sm p-4 sm:p-6 shadow-lg md:p-8`}>
              
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`p-2 sm:p-3 rounded-xl ${verdictConfig.bgColor} flex-shrink-0`}>
                  <VerdictIcon className={`h-8 w-8 sm:h-10 sm:w-10 ${verdictConfig.color}`} />
                </div>
                <div className="min-w-0">
                  <span className={`text-xl sm:text-2xl font-bold ${verdictConfig.color} md:text-3xl block break-words`}>
                    {verdictConfig.label}
                  </span>
                  <p className="text-sm text-foreground/70 mt-1">
                    {evaluation.inferredCategory || inputs?.inferredCategory 
                      ? `Detected: ${evaluation.inferredCategory || inputs?.inferredCategory}`
                      : ""}
                  </p>
                </div>
              </div>

              {/* Viability Score + Execution Difficulty */}
              {(() => {
                console.log("Passing to IdeaStrengthMeter:", {
                  viabilityScore: evaluation.viabilityScore,
                  executionDifficulty: evaluation.executionDifficulty
                });
                return null;
              })()}
              <IdeaStrengthMeter 
                fullEvaluation={evaluation.fullEvaluation} 
                verdict={evaluation.verdict}
                viabilityScore={evaluation.viabilityScore}
                executionDifficulty={evaluation.executionDifficulty}
                inferredExecutionMode={inputs?.inferredExecutionMode || evaluation.inferredExecutionMode}
              />

              {/* Asymmetric Upside Note */}
              {evaluation.hasAsymmetricUpside && (
                <div className="mt-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-foreground leading-relaxed">
                        <strong>Asymmetric upside detected:</strong> This idea has signals of potential non-linear growth 
                        (network effects, habit formation, or platform dynamics) that could create outsized returns 
                        if adoption or timing shifts in your favor.
                      </p>
                      {evaluation.asymmetricUpsideReason && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          {evaluation.asymmetricUpsideReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Summary Section */}
            {summaryText && (
              <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm p-5 sm:p-6 shadow-card">
                <h3 className="font-bold text-foreground text-lg mb-3">Summary</h3>
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {summaryText}
                </p>
              </div>
            )}

            {/* Full Evaluation Sections */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="font-bold text-foreground text-lg">Full Analysis</h3>
              {evaluationSections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm p-4 sm:p-5 shadow-card"
                >
                  <h4 className="font-semibold text-foreground mb-2 sm:mb-3">{section.title}</h4>
                  <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed break-words">
                    {section.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Full Evaluation (collapsible, open by default) */}
            <details open className="mt-6 rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-card">
              <summary className="p-5 cursor-pointer font-semibold text-foreground hover:text-primary transition-colors">
                View Full Evaluation
              </summary>
              <div className="px-5 pb-5 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed border-t border-border/30 pt-4">
                {evaluation!.fullEvaluation}
              </div>
            </details>

            {/* Actions */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                variant="outline"
                onClick={handleCopyResult}
                className="gap-2 rounded-lg border-border/60 bg-card/80 backdrop-blur-sm px-6 hover:bg-primary/5 hover:border-primary/30 transition-all w-full sm:w-auto"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Result
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleEditAndReEvaluate}
                className="gap-2 rounded-lg border-border/60 bg-card/80 backdrop-blur-sm px-6 hover:bg-primary/5 hover:border-primary/30 transition-all w-full sm:w-auto"
              >
                <Pencil className="h-4 w-4" />
                Edit & Re-evaluate
              </Button>

              <Button
                variant="outline"
                asChild
                className="gap-2 rounded-lg border-border/60 bg-card/80 backdrop-blur-sm px-6 hover:bg-primary/5 hover:border-primary/30 transition-all w-full sm:w-auto"
              >
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </Link>
              </Button>

              <Button
                asChild
                className="gap-2 rounded-lg px-6 shadow-md hover:shadow-lg transition-all hover:scale-[1.02] w-full sm:w-auto"
              >
                <Link to="/evaluate">
                  <RotateCcw className="h-4 w-4" />
                  New Evaluation
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Chat Assistant */}
      <VerdictChatAssistant
        verdict={evaluation.verdict}
        fullEvaluation={evaluation.fullEvaluation}
        ideaProblem={inputs?.problem || ""}
        projectType={inputs?.inferredCategory || evaluation.inferredCategory || ""}
      />
    </div>
  );
};

export default Results;
