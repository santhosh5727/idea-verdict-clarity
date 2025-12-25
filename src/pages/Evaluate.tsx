import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Rocket, Code, Cpu, GraduationCap, Beaker } from "lucide-react";
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

const PROJECT_TYPES = [
  { 
    id: "startup", 
    label: "Startup / Business Idea",
    description: "A product or service intended to generate revenue and scale.",
    icon: Rocket,
  },
  { 
    id: "saas", 
    label: "SaaS / Tool",
    description: "A software-based tool, platform, or AI product solving a specific problem.",
    icon: Code,
  },
  { 
    id: "hardware", 
    label: "Hardware Project",
    description: "Physical devices, IoT, electronics, robotics, or hardware prototypes.",
    icon: Cpu,
  },
  { 
    id: "academic", 
    label: "Academic / School Project",
    description: "College projects, final-year projects, research ideas, or assignments.",
    icon: GraduationCap,
  },
  { 
    id: "personal", 
    label: "Personal Experiment",
    description: "Side projects, learning builds, prototypes, or technical experiments.",
    icon: Beaker,
  },
] as const;

const steps = ["Project Name", "Problem", "Solution", "Target Users", "Differentiation", "Workflow", "Project Type"];

const stepContent = [
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
  {
    heading: "Project Type",
    placeholder: "",
    subtitle: "Not all ideas are startups. We evaluate based on what you are actually building.",
    isProjectType: true,
  },
];

interface PrefilledData {
  problem?: string;
  solution?: string;
  targetUsers?: string;
  differentiation?: string;
  workflow?: string;
  projectType?: string;
}

interface EditData extends PrefilledData {
  projectName?: string;
  evaluationId?: string;
}

const Evaluate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  // answers: [projectName, problem, solution, targetUsers, differentiation, workflow, projectType]
  const [answers, setAnswers] = useState<string[]>(["", "", "", "", "", "", ""]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);

  // Handle prefilled data from Nova or edit mode
  useEffect(() => {
    const state = location.state as { prefilled?: PrefilledData; editData?: EditData } | null;
    
    if (state?.prefilled) {
      // From Nova - fill in the rest
      setAnswers([
        "", // project name - user will fill this
        state.prefilled.problem || "",
        state.prefilled.solution || "",
        state.prefilled.targetUsers || "",
        state.prefilled.differentiation || "",
        state.prefilled.workflow || "",
        state.prefilled.projectType || "", // project type at end
      ]);
      // Clear the state so refresh doesn't re-apply
      window.history.replaceState({}, document.title);
    } else if (state?.editData) {
      // From Results page for re-evaluation
      setAnswers([
        state.editData.projectName || "",
        state.editData.problem || "",
        state.editData.solution || "",
        state.editData.targetUsers || "",
        state.editData.differentiation || "",
        state.editData.workflow || "",
        state.editData.projectType || "", // project type at end
      ]);
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
      // Validate all required fields before submission
      const projectName = answers[0].trim();
      const problem = answers[1].trim();
      const solution = answers[2].trim();
      const targetUsers = answers[3].trim();
      const projectType = answers[6];

      // Check required fields
      if (projectName.length < 2) {
        toast.error("Please enter a project name.");
        setCurrentStep(0);
        return;
      }
      if (problem.length < 80) {
        toast.error("Please provide a more detailed problem description (at least 80 characters).");
        setCurrentStep(1);
        return;
      }
      if (solution.length < 20) {
        toast.error("Please provide a solution description (at least 20 characters).");
        setCurrentStep(2);
        return;
      }
      if (targetUsers.length < 20) {
        toast.error("Please describe your target users (at least 20 characters).");
        setCurrentStep(3);
        return;
      }
      if (!projectType) {
        toast.error("Please select a project type.");
        return;
      }

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

        // Get project type label from selected id (now at index 6)
        const selectedProjectType = PROJECT_TYPES.find(pt => pt.id === projectType)?.label || projectType;

        // Normalize payload - AI will infer both category and execution mode
        // projectType is passed as context only
        const payload = {
          projectType: selectedProjectType,
          problem: problem,
          solution: solution || undefined,
          targetUsers: targetUsers,
          differentiation: answers[4].trim() || undefined,
          workflow: answers[5].trim() || undefined,
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
        if (user) {
          const { error: saveError } = await supabase.from("evaluations").insert({
            user_id: user.id,
            project_name: answers[0].trim() || null,
            idea_problem: payload.problem,
            solution: payload.solution || null,
            target_user: payload.targetUsers,
            differentiation: payload.differentiation || null,
            workflow: payload.workflow || null,
            project_type: selectedProjectType,
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
              projectType: selectedProjectType,
              projectName: answers[0].trim(),
              problem: payload.problem,
              solution: payload.solution,
              targetUsers: payload.targetUsers,
              differentiation: payload.differentiation,
              workflow: payload.workflow,
              inferredCategory: result.inferredCategory,
              inferredExecutionMode: result.inferredExecutionMode,
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

  // Minimum character requirements per step
  const getMinChars = (stepIndex: number): number => {
    switch (stepIndex) {
      case 0: return 2;   // Project Name
      case 1: return 80;  // Problem Description
      case 2: return 20;  // Solution
      case 3: return 20;  // Target Users
      case 6: return 0;   // Project Type (selection-based)
      default: return 0;
    }
  };

  // Get trimmed length (whitespace-only doesn't count)
  const getTrimmedLength = (text: string): number => text.trim().length;

  // Check if current step meets minimum requirements
  const isOptionalStep = stepContent[currentStep]?.isOptional;
  const isProjectNameStep = stepContent[currentStep]?.isProjectName;
  const isProjectTypeStep = stepContent[currentStep]?.isProjectType;
  const minChars = getMinChars(currentStep);
  const currentTrimmedLength = getTrimmedLength(answers[currentStep]);
  const meetsMinimum = isProjectTypeStep ? answers[currentStep] !== "" : currentTrimmedLength >= minChars;

  const canContinue = isOptionalStep || meetsMinimum;

  // Validation message for current step
  const getValidationMessage = (): string | null => {
    if (isOptionalStep) return null;
    if (meetsMinimum) return null;
    if (isProjectTypeStep) {
      return "Please select a project type to continue.";
    }
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

            {/* Subtitle */}
            {stepContent[currentStep]?.subtitle && (
              <p className="mb-8 text-muted-foreground">
                {stepContent[currentStep].subtitle}
              </p>
            )}

            {/* Input Fields */}
            {isProjectTypeStep ? (
              <div className="grid gap-4 mt-6 sm:grid-cols-2">
                {PROJECT_TYPES.map((type) => {
                  const IconComponent = type.icon;
                  const isSelected = answers[currentStep] === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => handleAnswerChange(type.id)}
                      className={`relative flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all shadow-sm hover:shadow-md ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-border/60 bg-card hover:border-primary/40 hover:bg-card/80"
                      }`}
                    >
                      {/* Radio indicator */}
                      <div className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/40"
                      }`}>
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                        )}
                      </div>
                      
                      {/* Icon */}
                      <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                        isSelected ? "bg-primary/10" : "bg-muted/50"
                      }`}>
                        <IconComponent className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 pr-6">
                        <span className={`font-semibold block ${isSelected ? "text-foreground" : "text-foreground/90"}`}>
                          {type.label}
                        </span>
                        <span className="text-sm text-muted-foreground mt-1 block leading-relaxed">
                          {type.description}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : isProjectNameStep ? (
              <>
                {!stepContent[currentStep]?.subtitle && <div className="mb-6" />}
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
                {!stepContent[currentStep]?.subtitle && <div className="mb-6" />}
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
