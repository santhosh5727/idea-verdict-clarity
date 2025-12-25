import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Target, Building2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import StepIndicator from "@/components/StepIndicator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logError } from "@/lib/logger";
import logo from "@/assets/logo.png";

const steps = ["Evaluation Mode", "Project Name", "Problem", "Solution", "Target Users", "Differentiation", "Workflow"];

const stepContent = [
  {
    heading: "How should we evaluate your idea?",
    placeholder: "",
    subtitle: "This frames expectations—not inputs. Choose the lens that matches your goals.",
    isEvaluationMode: true,
  },
  {
    heading: "What's your project name?",
    placeholder: "Enter a name for your project...",
    subtitle: "Give your idea a memorable name",
    isProjectName: true,
  },
  {
    heading: "What problem are you solving?",
    placeholder: "Describe the specific pain point your solution addresses...",
  },
  {
    heading: "What is your solution?",
    placeholder: "Explain how your product or service solves this problem...",
  },
  {
    heading: "Who are your target users?",
    placeholder: "Define your primary user personas and market segment...",
  },
  {
    heading: "What makes your solution unique?",
    placeholder: "Explain your competitive advantage and what sets you apart...",
  },
  {
    heading: "How does your idea work? (Optional)",
    placeholder: "Describe the step-by-step workflow or mechanism of how your idea operates in the real world...",
    subtitle: "This optional field helps validate execution realism. Simple, realistic workflows are preferred.",
    isOptional: true,
  },
];

const evaluationModes = [
  {
    id: "indie",
    label: "Indie / Micro-SaaS",
    description: "Bootstrapped, solo-founder friendly. Optimized for $10K-$100K MRR paths.",
    icon: Target,
    isDefault: true,
  },
  {
    id: "venture",
    label: "Venture / Infra / Hard Tech",
    description: "High capital, high difficulty allowed. Judged on market size and moat depth.",
    icon: Building2,
  },
  {
    id: "academic",
    label: "Academic / Learning Project",
    description: "Judged on learning value and skill development. Monetization not considered.",
    icon: BookOpen,
  },
];


interface PrefilledData {
  problem?: string;
  solution?: string;
  targetUsers?: string;
  differentiation?: string;
  workflow?: string;
}

interface EditData extends PrefilledData {
  projectName?: string;
  projectType?: string;
  evaluationMode?: string;
  evaluationId?: string;
}

const Evaluate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  // answers: [evaluationMode, projectName, problem, solution, targetUsers, differentiation, workflow]
  const [answers, setAnswers] = useState<string[]>(["", "", "", "", "", "", ""]);
  const [selectedEvaluationMode, setSelectedEvaluationMode] = useState<string>("indie");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);

  // Handle prefilled data from Nova or edit mode
  useEffect(() => {
    const state = location.state as { prefilled?: PrefilledData; editData?: EditData } | null;
    
    if (state?.prefilled) {
      // From Nova - skip evaluation mode and project name step, fill in the rest
      setAnswers([
        "", // evaluation mode
        "", // project name - user will fill this
        state.prefilled.problem || "",
        state.prefilled.solution || "",
        state.prefilled.targetUsers || "",
        state.prefilled.differentiation || "",
        state.prefilled.workflow || "",
      ]);
      // Clear the state so refresh doesn't re-apply
      window.history.replaceState({}, document.title);
    } else if (state?.editData) {
      // From Results page for re-evaluation
      setAnswers([
        "", // evaluation mode
        state.editData.projectName || "",
        state.editData.problem || "",
        state.editData.solution || "",
        state.editData.targetUsers || "",
        state.editData.differentiation || "",
        state.editData.workflow || "",
      ]);
      setSelectedEvaluationMode(state.editData.evaluationMode || "indie");
      if (state.editData.evaluationId) {
        setEditingEvaluationId(state.editData.evaluationId);
      }
      // Clear the state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleBack = () => {
    if (currentStep === 0) {
      navigate("/");
    } else {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleContinue = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Submit evaluation to AI
      setIsEvaluating(true);
      try {
        // Get the user's session token for authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Please log in to evaluate your idea.");
          setIsEvaluating(false);
          navigate("/auth");
          return;
        }

        // Normalize payload - ensure all values are properly formatted
        // Note: projectType is no longer user-selected - it's inferred by AI
        const payload = {
          problem: answers[2].trim(),
          solution: answers[3].trim() || undefined,
          targetUsers: answers[4].trim(),
          differentiation: answers[5].trim() || undefined,
          workflow: answers[6].trim() || undefined,
          evaluationMode: selectedEvaluationMode || "indie",
        };

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-idea`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 401) {
            toast.error("Please log in to evaluate your idea.");
            navigate("/auth");
          } else if (response.status === 429) {
            toast.error("Rate limit exceeded. Please try again in a moment.");
          } else if (response.status === 402) {
            toast.error("AI credits exhausted. Please add funds to continue.");
          } else {
            toast.error(errorData.error || "Evaluation failed. Please try again.");
          }
          setIsEvaluating(false);
          return;
        }

        const result = await response.json();
        
        // Save evaluation to database
        // Note: project_type and inferred_category come from AI response
        if (user) {
          const { error: saveError } = await supabase.from("evaluations").insert({
            user_id: user.id,
            project_name: answers[1].trim() || null,
            idea_problem: payload.problem,
            solution: payload.solution || null,
            target_user: payload.targetUsers,
            differentiation: payload.differentiation || null,
            workflow: payload.workflow || null,
            project_type: result.inferredCategory || "Other",
            verdict_type: result.verdict,
            full_verdict_text: result.fullEvaluation,
            inferred_category: result.inferredCategory || null,
          });
          
          if (saveError) {
            logError("Failed to save evaluation:", saveError);
            // Continue anyway - don't block user from seeing results
          }
        }
        
        // Navigate to results with the evaluation data
        navigate("/results", { 
          state: { 
            evaluation: result,
            inputs: {
              projectName: answers[1].trim(),
              problem: payload.problem,
              solution: payload.solution,
              targetUsers: payload.targetUsers,
              differentiation: payload.differentiation,
              workflow: payload.workflow,
              evaluationMode: payload.evaluationMode,
              inferredCategory: result.inferredCategory,
            }
          } 
        });
      } catch (error) {
        logError("Evaluation error:", error);
        toast.error("Failed to evaluate idea. Please try again.");
        setIsEvaluating(false);
      }
    }
  };

  const handleAnswerChange = (value: string) => {
    const newAnswers = [...answers];
    newAnswers[currentStep] = value;
    setAnswers(newAnswers);
  };

  const isLastStep = currentStep === steps.length - 1;

  // Minimum character requirements per step (adjusted for new step order)
  const getMinChars = (stepIndex: number): number => {
    switch (stepIndex) {
      case 1: return 2;   // Project Name
      case 2: return 80;  // Problem Description
      case 4: return 20;  // Target Users
      case 3: return 20;  // Solution (Intended Outcome)
      default: return 0;
    }
  };

  // Get trimmed length (whitespace-only doesn't count)
  const getTrimmedLength = (text: string): number => text.trim().length;

  // Check if current step meets minimum requirements
  const isOptionalStep = stepContent[currentStep].isOptional;
  const isProjectNameStep = stepContent[currentStep].isProjectName;
  const isEvaluationModeStep = stepContent[currentStep].isEvaluationMode;
  const minChars = getMinChars(currentStep);
  const currentTrimmedLength = getTrimmedLength(answers[currentStep]);
  const meetsMinimum = currentTrimmedLength >= minChars;

  const canContinue = stepContent[currentStep].isEvaluationMode
    ? selectedEvaluationMode !== ""
    : isOptionalStep || meetsMinimum;

  // Validation message for current step
  const getValidationMessage = (): string | null => {
    if (stepContent[currentStep].isEvaluationMode || isOptionalStep) return null;
    if (meetsMinimum) return null;
    if (isProjectNameStep && minChars > 0) {
      return "Please enter a project name.";
    }
    const remaining = minChars - currentTrimmedLength;
    return `Please add more detail (${remaining} more character${remaining !== 1 ? 's' : ''} needed).`;
  };

  const validationMessage = getValidationMessage();

  const handleStepClick = (stepIndex: number) => {
    if (!isEvaluating) {
      setCurrentStep(stepIndex);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
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

      {/* Step Indicator */}
      <StepIndicator steps={steps} currentStep={currentStep} onStepClick={handleStepClick} />

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-r from-primary/8 via-primary/3 to-background">
        <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16">
          <div className="mx-auto max-w-3xl">
            {/* Step Counter */}
            <p className="mb-2 text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </p>

            {/* Heading */}
            <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
              {stepContent[currentStep].heading}
            </h1>

            {/* Subtitle for project type step */}
            {stepContent[currentStep].subtitle && (
              <p className="mb-8 text-muted-foreground">
                {stepContent[currentStep].subtitle}
              </p>
            )}

            {/* Evaluation Mode Selection */}
            {isEvaluationModeStep ? (
              <div className="space-y-4">
                {/* Positioning Copy */}
                <div className="mb-6 p-4 rounded-lg border border-border/50 bg-muted/30">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Note:</strong> This engine is optimized to prevent wasted effort on low-leverage ideas. 
                    It is intentionally conservative and biased against high-risk execution. 
                    A low score does NOT mean the idea is bad—it means execution risk is high under the selected mode.
                  </p>
                </div>

                <div className="grid gap-4">
                  {evaluationModes.map((mode) => {
                    const Icon = mode.icon;
                    const isSelected = selectedEvaluationMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSelectedEvaluationMode(mode.id)}
                        disabled={isEvaluating}
                        className={`group text-left rounded-xl border p-5 transition-all duration-300 ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-lg"
                            : "border-border/50 bg-card/90 backdrop-blur-sm shadow-card hover:shadow-lg hover:border-primary/30"
                        } ${isEvaluating ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                              isSelected
                                ? "bg-primary/20"
                                : "bg-primary/10 group-hover:bg-primary/20"
                            }`}
                          >
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3
                                className={`font-semibold transition-colors ${
                                  isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
                                }`}
                              >
                                {mode.label}
                              </h3>
                              {mode.isDefault && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {mode.description}
                            </p>
                          </div>
                          {/* Selection indicator */}
                          <div
                            className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? "border-primary bg-primary"
                                : "border-border"
                            }`}
                          >
                            {isSelected && (
                              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : stepContent[currentStep].isProjectName ? (
              <>
                {!stepContent[currentStep].subtitle && <div className="mb-6" />}
                <Input
                  placeholder={stepContent[currentStep].placeholder}
                  value={answers[currentStep]}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  className="rounded-xl border-border/50 bg-card/90 backdrop-blur-sm text-lg py-6 px-4 shadow-card focus:border-primary/50 focus:ring-primary/20"
                  maxLength={100}
                />
              </>
            ) : (
              <>
                {!stepContent[currentStep].subtitle && <div className="mb-6" />}
                <Textarea
                  placeholder={stepContent[currentStep].placeholder}
                  value={answers[currentStep]}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  className="min-h-[280px] resize-none rounded-xl border-border/50 bg-card/90 backdrop-blur-sm text-base shadow-card focus:border-primary/50 focus:ring-primary/20"
                />
              </>
            )}

            {/* Navigation */}
            <div className="mt-6 sm:mt-8 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isEvaluating}
                className="gap-2 rounded-lg border-border/60 bg-card/80 backdrop-blur-sm px-4 sm:px-6 hover:bg-primary/5 hover:border-primary/30 transition-all flex-1 sm:flex-none"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>

              <Button
                onClick={handleContinue}
                disabled={!canContinue || isEvaluating}
                className="gap-2 rounded-lg px-4 sm:px-6 shadow-md hover:shadow-lg transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex-1 sm:flex-none"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Evaluating...</span>
                  </>
                ) : (
                  <>
                    {isLastStep ? "Get Verdict" : "Continue"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {/* Validation Message */}
            {validationMessage && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {validationMessage}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Evaluate;
