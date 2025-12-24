import { useEffect, useState } from "react";
import { 
  parseStrengthScore, 
  getDefinitiveVerdict, 
  getFallbackScore,
  getVerdictFromScore 
} from "@/lib/verdictUtils";

interface IdeaStrengthMeterProps {
  fullEvaluation: string;
  verdict: string;
}

const IdeaStrengthMeter = ({ fullEvaluation, verdict }: IdeaStrengthMeterProps) => {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  // Get score from evaluation, or fallback based on definitive verdict
  const getTargetScore = (): number => {
    const parsedScore = parseStrengthScore(fullEvaluation);
    if (parsedScore !== null) {
      return parsedScore;
    }
    
    // Fallback: derive verdict from raw string and get fallback score
    const verdictType = getDefinitiveVerdict(fullEvaluation, verdict);
    return getFallbackScore(verdictType);
  };

  const targetPercentage = getTargetScore();

  // Animate the percentage from 0 to target
  useEffect(() => {
    const duration = 1500; // 1.5 seconds
    const steps = 60;
    const increment = targetPercentage / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= targetPercentage) {
        setAnimatedPercentage(targetPercentage);
        clearInterval(timer);
      } else {
        setAnimatedPercentage(Math.round(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [targetPercentage]);

  // Determine color based on percentage using same thresholds as verdict
  const getColor = (percentage: number): string => {
    if (percentage < 40) return "hsl(0, 84%, 60%)"; // Red - KILL
    if (percentage < 70) return "hsl(45, 93%, 47%)"; // Yellow - NARROW
    return "hsl(142, 71%, 45%)"; // Green - BUILD
  };

  const getColorClass = (percentage: number): string => {
    if (percentage < 40) return "text-destructive";
    if (percentage < 70) return "text-warning";
    return "text-primary";
  };

  const color = getColor(animatedPercentage);

  return (
    <div className="w-full mt-4">
      {/* Label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">Idea Strength Meter</span>
        <span className={`text-sm font-bold ${getColorClass(animatedPercentage)}`}>
          {animatedPercentage}%
        </span>
      </div>

      {/* Slider track */}
      <div className="relative h-3 w-full rounded-full bg-muted/50 overflow-hidden">
        {/* Gradient background hint */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            background: "linear-gradient(to right, hsl(0, 84%, 60%) 0%, hsl(45, 93%, 47%) 50%, hsl(142, 71%, 45%) 100%)"
          }}
        />
        
        {/* Filled portion */}
        <div
          className="h-full rounded-full transition-all duration-75 ease-out"
          style={{
            width: `${animatedPercentage}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mt-2">
        Visual representation of idea quality based on problem specificity, feasibility, execution, user clarity, and differentiation.
      </p>
    </div>
  );
};

export default IdeaStrengthMeter;
