import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

const StepIndicator = ({ steps, currentStep }: StepIndicatorProps) => {
  return (
    <div className="border-b border-border/50 bg-background/50">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((step, index) => (
          <div key={step} className="flex flex-col">
            <span
              className={cn(
                "px-4 py-4 text-sm font-medium",
                index <= currentStep ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
            <div
              className={cn(
                "h-1 w-full",
                index < currentStep
                  ? "bg-primary"
                  : index === currentStep
                  ? "bg-primary"
                  : "bg-border/50"
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default StepIndicator;
