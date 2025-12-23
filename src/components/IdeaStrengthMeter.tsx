import { useEffect, useState } from "react";

interface IdeaStrengthMeterProps {
  fullEvaluation: string;
  verdict: string;
}

const IdeaStrengthMeter = ({ fullEvaluation, verdict }: IdeaStrengthMeterProps) => {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  // Calculate idea strength percentage based on evaluation dimensions
  const calculateStrength = (): number => {
    let score = 50; // Base score

    const text = fullEvaluation.toLowerCase();

    // Problem specificity scoring
    if (text.includes("well-defined") || text.includes("specific problem") || text.includes("clear problem")) {
      score += 10;
    } else if (text.includes("vague") || text.includes("unclear problem") || text.includes("not specific")) {
      score -= 10;
    }

    // App-solvability / Feasibility scoring
    if (text.includes("can be solved") || text.includes("feasible") || text.includes("app-solvable")) {
      score += 10;
    } else if (text.includes("cannot be solved") || text.includes("not app-solvable") || text.includes("not feasible")) {
      score -= 15;
    }

    // Execution realism scoring
    if (text.includes("realistic") || text.includes("achievable") || text.includes("execution is possible")) {
      score += 10;
    } else if (text.includes("unrealistic") || text.includes("not achievable") || text.includes("execution") && text.includes("fail")) {
      score -= 10;
    }

    // User clarity scoring
    if (text.includes("clear target") || text.includes("well-defined user") || text.includes("specific audience")) {
      score += 10;
    } else if (text.includes("unclear user") || text.includes("vague audience") || text.includes("who is this for")) {
      score -= 10;
    }

    // Differentiation scoring
    if (text.includes("unique") || text.includes("differentiated") || text.includes("novel approach")) {
      score += 10;
    } else if (text.includes("already exists") || text.includes("no differentiation") || text.includes("too similar")) {
      score -= 10;
    }

    // Verdict-based adjustment
    if (verdict === "PROCEED TO MVP") {
      score = Math.max(score, 75);
      score = Math.min(score + 15, 100);
    } else if (verdict === "BUILD ONLY IF NARROWED") {
      score = Math.max(Math.min(score, 70), 45);
    } else {
      // DO NOT BUILD
      score = Math.min(score, 40);
      score = Math.max(score - 10, 5);
    }

    return Math.max(0, Math.min(100, score));
  };

  const targetPercentage = calculateStrength();

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
