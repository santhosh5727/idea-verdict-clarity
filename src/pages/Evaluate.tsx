import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Rocket, Cpu, GraduationCap, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import StepIndicator from "@/components/StepIndicator";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

const steps = ["Problem", "Solution", "Target Users", "Differentiation", "Project Type"];

const stepContent = [
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
    heading: "Project Type",
    placeholder: "",
    subtitle: "Not all ideas are startups. We evaluate based on what you are actually building.",
    isProjectType: true,
  },
];

const projectTypes = [
  {
    id: "startup",
    label: "Startup / Business Idea",
    description: "A product or service intended to generate revenue.",
    icon: Rocket,
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
    description: "Side projects, learning builds, or technical experiments.",
    icon: FlaskConical,
  },
];

const Evaluate = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(["", "", "", "", ""]);
  const [selectedProjectType, setSelectedProjectType] = useState<string>("");
  const [isEvaluating, setIsEvaluating] = useState(false);

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
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-idea`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              problem: answers[0],
              solution: answers[1],
              targetUsers: answers[2],
              differentiation: answers[3],
              projectType: selectedProjectType,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 429) {
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
        
        // Navigate to results with the evaluation data
        navigate("/results", { 
          state: { 
            evaluation: result,
            inputs: {
              problem: answers[0],
              solution: answers[1],
              targetUsers: answers[2],
              differentiation: answers[3],
              projectType: selectedProjectType,
            }
          } 
        });
      } catch (error) {
        console.error("Evaluation error:", error);
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

  // Check if current step is valid to continue
  const canContinue = stepContent[currentStep].isProjectType 
    ? selectedProjectType !== "" 
    : answers[currentStep].trim() !== "";

  return (
    <div className="min-h-screen flex flex-col">
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

      {/* Step Indicator */}
      <StepIndicator steps={steps} currentStep={currentStep} />

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-r from-primary/8 via-primary/3 to-background">
        <div className="container mx-auto px-4 py-12 md:py-16">
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

            {/* Project Type Selection or Textarea */}
            {stepContent[currentStep].isProjectType ? (
              <div className="grid gap-4 sm:grid-cols-2 mx-auto max-w-2xl">
                {projectTypes.map((type) => {
                  const Icon = type.icon;
                  const isSelected = selectedProjectType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedProjectType(type.id)}
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
                          <h3
                            className={`font-semibold transition-colors ${
                              isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
                            }`}
                          >
                            {type.label}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {type.description}
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
            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isEvaluating}
                className="gap-2 rounded-lg border-border/60 bg-card/80 backdrop-blur-sm px-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <Button
                onClick={handleContinue}
                disabled={!canContinue || isEvaluating}
                className="gap-2 rounded-lg px-6 shadow-md hover:shadow-lg transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    {isLastStep ? "Get Verdict" : "Continue"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Evaluate;
