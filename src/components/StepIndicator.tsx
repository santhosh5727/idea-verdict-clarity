import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
}

const StepIndicator = ({ steps, currentStep, onStepClick }: StepIndicatorProps) => {
  return (
    <div className="border-b border-border/50 bg-background/50 overflow-x-auto">
      <div className="flex min-w-max sm:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((step, index) => (
          <button
            key={step}
            type="button"
            onClick={() => onStepClick?.(index)}
            className={cn(
              "flex flex-col flex-1 min-w-[80px] sm:min-w-0 transition-colors",
              onStepClick && "cursor-pointer hover:bg-primary/5"
            )}
          >
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
          </button>
        ))}
      </div>
    </div>
  );
};

export default StepIndicator;
