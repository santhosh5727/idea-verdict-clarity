import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

const StepIndicator = ({ steps, currentStep }: StepIndicatorProps) => {
  return (
    <div className="border-b border-border/50 bg-background/50 overflow-x-auto">
      <div className="flex min-w-max sm:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((step, index) => (
          <div key={step} className="flex flex-col flex-1 min-w-[80px] sm:min-w-0">
            <span
              className={cn(
                "px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-center sm:text-left whitespace-nowrap",
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
