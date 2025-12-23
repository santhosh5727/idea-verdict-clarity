import { Link, useLocation, Navigate } from "react-router-dom";
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

interface EvaluationResult {
  verdict: string;
  fullEvaluation: string;
  projectType: string;
}

interface EvaluationInputs {
  problem: string;
  solution: string;
  targetUsers: string;
  differentiation: string;
  projectType: string;
}

const Results = () => {
  const location = useLocation();
  const state = location.state as { evaluation: EvaluationResult; inputs: EvaluationInputs } | null;

  // Redirect to evaluate if no result data
  if (!state?.evaluation) {
    return <Navigate to="/evaluate" replace />;
  }

  const { evaluation, inputs } = state;

  // Determine verdict styling
  const getVerdictConfig = (verdict: string) => {
    if (verdict === "PROCEED TO MVP") {
      return {
        icon: CheckCircle,
        color: "text-primary",
        bgColor: "bg-primary/10",
        borderColor: "border-primary/20",
        label: "PROCEED TO MVP",
      };
    } else if (verdict === "BUILD ONLY IF NARROWED") {
      return {
        icon: AlertTriangle,
        color: "text-warning",
        bgColor: "bg-warning/10",
        borderColor: "border-warning/20",
        label: "BUILD ONLY IF NARROWED",
      };
    } else {
      return {
        icon: XCircle,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        borderColor: "border-destructive/20",
        label: "DO NOT BUILD",
      };
    }
  };

  const verdictConfig = getVerdictConfig(evaluation.verdict);
  const VerdictIcon = verdictConfig.icon;

  // Parse the full evaluation into sections
  const parseEvaluation = (text: string) => {
    const sections: { title: string; content: string }[] = [];
    
    const sectionPatterns = [
      { key: "PRIMARY BLOCKER:", title: "Primary Blocker" },
      { key: "WHY THIS MATTERS:", title: "Why This Matters" },
      { key: "WHAT PASSED:", title: "What Passed" },
      { key: "WHAT FAILED:", title: "What Failed" },
      { key: "WHAT WOULD CHANGE THIS VERDICT:", title: "What Would Change This Verdict" },
    ];

    let remainingText = text;
    
    // Remove the VERDICT line from the text
    remainingText = remainingText.replace(/VERDICT:\s*\n?[^\n]*\n?/i, "");

    sectionPatterns.forEach((pattern, index) => {
      const startIndex = remainingText.indexOf(pattern.key);
      if (startIndex !== -1) {
        const nextPattern = sectionPatterns[index + 1];
        const endIndex = nextPattern 
          ? remainingText.indexOf(nextPattern.key)
          : remainingText.length;
        
        let content = remainingText
          .substring(startIndex + pattern.key.length, endIndex !== -1 ? endIndex : undefined)
          .trim();
        
        if (content) {
          sections.push({ title: pattern.title, content });
        }
      }
    });

    return sections;
  };

  const evaluationSections = parseEvaluation(evaluation.fullEvaluation);

  const projectTypeLabels: Record<string, string> = {
    startup: "Startup / Business Idea",
    hardware: "Hardware Project",
    academic: "Academic / School Project",
    personal: "Personal Experiment",
  };

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Idea Verdict" 
              className="h-12 md:h-14 w-auto"
              style={{ filter: 'hue-rotate(-10deg)' }}
            />
          </Link>

          <Link
            to="/dashboard"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="bg-gradient-to-r from-primary/8 via-primary/3 to-background min-h-[calc(100vh-64px)]">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto max-w-3xl">
            {/* Verdict Card */}
            <div className={`mb-8 rounded-xl border ${verdictConfig.borderColor} bg-card/90 backdrop-blur-sm p-6 shadow-lg md:p-8`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${verdictConfig.bgColor}`}>
                  <VerdictIcon className={`h-10 w-10 ${verdictConfig.color}`} />
                </div>
                <div>
                  <span className={`text-2xl font-bold ${verdictConfig.color} md:text-3xl`}>
                    {verdictConfig.label}
                  </span>
                  <p className="text-sm text-muted-foreground mt-1">
                    {projectTypeLabels[inputs.projectType] || inputs.projectType}
                  </p>
                </div>
              </div>
            </div>

            {/* Evaluation Sections */}
            <div className="space-y-4">
              {evaluationSections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm p-5 shadow-card"
                >
                  <h3 className="font-semibold text-foreground mb-3">{section.title}</h3>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {section.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Full Evaluation (collapsible) */}
            <details className="mt-6 rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-card">
              <summary className="p-5 cursor-pointer font-semibold text-foreground hover:text-primary transition-colors">
                View Full Evaluation
              </summary>
              <div className="px-5 pb-5 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed border-t border-border/30 pt-4">
                {evaluation.fullEvaluation}
              </div>
            </details>

            {/* Actions */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
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
                  Evaluate Another Idea
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Results;
