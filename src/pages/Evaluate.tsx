import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import StepIndicator from "@/components/StepIndicator";

const steps = ["Problem", "Solution", "Target Users", "Differentiation"];

const stepContent = [
  {
    heading: "What problem are you solving?",
    placeholder: "Describe the specific pain point your solution addresses…",
  },
  {
    heading: "What is your proposed solution?",
    placeholder: "Describe how your product or service solves this problem…",
  },
  {
    heading: "Who are your target users?",
    placeholder: "Describe your ideal customer profile and market segment…",
  },
  {
    heading: "What makes you different?",
    placeholder: "Explain your unique value proposition and competitive advantage…",
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
      // Submit evaluation
      navigate("/dashboard");
    }
  };

  const handleAnswerChange = (value: string) => {
    const newAnswers = [...answers];
    newAnswers[currentStep] = value;
    setAnswers(newAnswers);
  };

  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="mx-auto max-w-2xl">
          {/* Step Indicator */}
          <StepIndicator steps={steps} currentStep={currentStep} />

          {/* Form Content */}
          <div className="rounded-xl border border-border/50 bg-card p-6 shadow-card md:p-8">
            <h2 className="mb-4 text-xl font-semibold text-foreground md:text-2xl">
              {stepContent[currentStep].heading}
            </h2>

            <Textarea
              placeholder={stepContent[currentStep].placeholder}
              value={answers[currentStep]}
              onChange={(e) => handleAnswerChange(e.target.value)}
              className="min-h-[200px] resize-none text-base"
            />

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={handleBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <Button onClick={handleContinue} className="gap-2">
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
