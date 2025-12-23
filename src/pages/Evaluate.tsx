import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import StepIndicator from "@/components/StepIndicator";
import logo from "@/assets/logo.png";

const steps = ["Problem", "Solution", "Target Users", "Differentiation"];

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
];

const Evaluate = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);

  const handleBack = () => {
    if (currentStep === 0) {
      navigate("/");
    } else {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleContinue = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Submit evaluation and go to results
      navigate("/results");
    }
  };

  const handleAnswerChange = (value: string) => {
    const newAnswers = [...answers];
    newAnswers[currentStep] = value;
    setAnswers(newAnswers);
  };

  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Idea Verdict" 
              className="h-10 md:h-12 w-auto"
              style={{ filter: 'hue-rotate(-10deg)' }}
            />
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
            <h1 className="mb-8 text-2xl font-bold text-foreground md:text-3xl">
              {stepContent[currentStep].heading}
            </h1>

            {/* Textarea */}
            <Textarea
              placeholder={stepContent[currentStep].placeholder}
              value={answers[currentStep]}
              onChange={(e) => handleAnswerChange(e.target.value)}
              className="min-h-[280px] resize-none rounded-xl border-border/50 bg-card/90 backdrop-blur-sm text-base shadow-card focus:border-primary/50 focus:ring-primary/20"
            />

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                className="gap-2 rounded-lg border-border/60 bg-card/80 backdrop-blur-sm px-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <Button
                onClick={handleContinue}
                className="gap-2 rounded-lg px-6 shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              >
                {isLastStep ? "Get Verdict" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Evaluate;
