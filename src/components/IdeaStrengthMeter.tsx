import { useEffect, useState } from "react";
import { 
  parseViabilityScore, 
  parseExecutionDifficulty,
  getDefinitiveVerdict, 
  getFallbackScore,
} from "@/lib/verdictUtils";
import { Gauge, Zap } from "lucide-react";

interface IdeaStrengthMeterProps {
  fullEvaluation: string;
  verdict: string;
  inferredExecutionMode?: string;
}

const IdeaStrengthMeter = ({ fullEvaluation, verdict, inferredExecutionMode }: IdeaStrengthMeterProps) => {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  // Get viability score from evaluation, or fallback based on definitive verdict
  const getTargetScore = (): number => {
    const parsedScore = parseViabilityScore(fullEvaluation);
    if (parsedScore !== null) {
      return parsedScore;
    }
    
    // Fallback: derive verdict from raw string and get fallback score
    const verdictType = getDefinitiveVerdict(fullEvaluation, verdict);
    return getFallbackScore(verdictType);
  };

  const targetPercentage = getTargetScore();
  const executionDifficulty = parseExecutionDifficulty(fullEvaluation);

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

  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty) {
      case "EASY": return "text-primary bg-primary/10 border-primary/30";
      case "MEDIUM": return "text-warning bg-warning/10 border-warning/30";
      case "HARD": return "text-destructive bg-destructive/10 border-destructive/30";
      default: return "text-warning bg-warning/10 border-warning/30"; // Default to MEDIUM styling
    }
  };

  const color = getColor(animatedPercentage);

  return (
    <div className="w-full mt-4 space-y-4">
      {/* Inferred mode indicator - shown subtly after evaluation */}
      {inferredExecutionMode && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Evaluation lens used:</span>
          <span className="font-medium text-foreground">{inferredExecutionMode}</span>
        </div>
      )}

      {/* Two-axis display */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Viability Score */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Viability Score</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${getColorClass(animatedPercentage)}`}>
              {animatedPercentage}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Probability of success in principle
          </p>
          
          {/* Viability bar */}
          <div className="mt-3 relative h-2 w-full rounded-full bg-muted/50 overflow-hidden">
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                background: "linear-gradient(to right, hsl(0, 84%, 60%) 0%, hsl(45, 93%, 47%) 50%, hsl(142, 71%, 45%) 100%)"
              }}
            />
            <div
              className="h-full rounded-full transition-all duration-75 ease-out"
              style={{
                width: `${animatedPercentage}%`,
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}`,
              }}
            />
          </div>
        </div>

        {/* Execution Difficulty - always shown */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Execution Difficulty</span>
          </div>
          <div className={`inline-flex items-center px-3 py-1 rounded-full border text-sm font-semibold ${getDifficultyColor(executionDifficulty)}`}>
            {executionDifficulty}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {executionDifficulty === "EASY" && "Can be shipped by solo founder in weeks"}
            {executionDifficulty === "MEDIUM" && "Requires small team, 3-6 months runway"}
            {executionDifficulty === "HARD" && "Requires significant capital, multi-year timeline"}
          </p>
        </div>
      </div>

      {/* Clarification note - softer language */}
      <p className="text-xs text-muted-foreground">
        Difficulty and viability are independent signals. Complex ideas can be highly viable; simple ideas may have low viability under this lens.
      </p>
    </div>
  );
};

export default IdeaStrengthMeter;
