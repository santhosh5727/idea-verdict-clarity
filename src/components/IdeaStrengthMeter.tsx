import { useEffect, useState } from "react";

interface IdeaStrengthMeterProps {
  fullEvaluation: string;
  verdict: string;
}

const IdeaStrengthMeter = ({ fullEvaluation, verdict }: IdeaStrengthMeterProps) => {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  // Parse the AI-generated Idea Strength Score from the evaluation
  const parseStrengthScore = (): number => {
    // Look for "IDEA STRENGTH SCORE: X%" pattern
    const scoreMatch = fullEvaluation.match(/IDEA STRENGTH SCORE:\s*(\d+)%?/i);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      if (!isNaN(score) && score >= 0 && score <= 100) {
        return score;
      }
    }

    // Fallback based on verdict if no score found
    if (verdict === "PROCEED TO MVP") {
      return 65;
    } else if (verdict === "BUILD ONLY IF NARROWED") {
      return 40;
    } else {
      return 20;
    }
  };

  const targetPercentage = parseStrengthScore();

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

  // Determine color based on percentage
  const getColor = (percentage: number): string => {
    if (percentage <= 40) return "hsl(0, 84%, 60%)"; // Red
    if (percentage <= 70) return "hsl(45, 93%, 47%)"; // Yellow
    return "hsl(142, 71%, 45%)"; // Green
  };

  const getColorClass = (percentage: number): string => {
    if (percentage <= 40) return "text-destructive";
    if (percentage <= 70) return "text-warning";
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
