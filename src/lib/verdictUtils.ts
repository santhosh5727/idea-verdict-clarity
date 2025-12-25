import { CheckCircle, XCircle, AlertTriangle, LucideIcon } from "lucide-react";

export type VerdictType = "build" | "narrow" | "kill";

export interface VerdictConfig {
  type: VerdictType;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

/**
 * Parse the Idea Strength Score from the evaluation text
 */
export const parseStrengthScore = (fullEvaluation: string): number | null => {
  const scoreMatch = fullEvaluation.match(/IDEA STRENGTH SCORE:\s*(\d+)%?/i);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    if (!isNaN(score) && score >= 0 && score <= 100) {
      return score;
    }
  }
  return null;
};

/**
 * Derive verdict type from score using consistent thresholds:
 * - Score >= 70 → BUILD (PROCEED TO MVP)
 * - Score 40-69 → NARROW (BUILD ONLY IF NARROWED)
 * - Score < 40 → KILL (DO NOT BUILD)
 */
export const getVerdictFromScore = (score: number): VerdictType => {
  if (score >= 70) return "build";
  if (score >= 40) return "narrow";
  return "kill";
};

/**
 * Map raw verdict string from AI to verdict type
 */
export const parseRawVerdict = (verdict: string): VerdictType => {
  const normalized = verdict.toUpperCase().trim();
  
  if (
    normalized.includes("PROCEED TO MVP") ||
    normalized.includes("BUILD") && !normalized.includes("NARROW") && !normalized.includes("DO NOT")
  ) {
    return "build";
  }
  
  if (
    normalized.includes("BUILD ONLY IF NARROWED") ||
    normalized.includes("NARROW")
  ) {
    return "narrow";
  }
  
  return "kill";
};

/**
 * Get the definitive verdict by prioritizing score over raw verdict string
 * This ensures consistency between the meter and the verdict card
 * 
 * CRITICAL: Verdict is ALWAYS derived from score using deterministic thresholds:
 * - Score >= 70 → BUILD
 * - Score 40-69 → NARROW  
 * - Score < 40 → KILL
 * 
 * The AI's verdict text is NEVER trusted as source of truth.
 */
export const getDefinitiveVerdict = (fullEvaluation: string, rawVerdict: string): VerdictType => {
  const score = parseStrengthScore(fullEvaluation);
  
  // If we have a score, derive verdict from it (SINGLE SOURCE OF TRUTH)
  // This is the ONLY reliable way to determine verdict
  if (score !== null) {
    const computedVerdict = getVerdictFromScore(score);
    console.log(`[verdictUtils] Score: ${score}% → Verdict: ${computedVerdict}`);
    return computedVerdict;
  }
  
  // Fallback to parsing the raw verdict string (should rarely happen)
  console.warn(`[verdictUtils] No score found in evaluation, falling back to raw verdict parsing`);
  return parseRawVerdict(rawVerdict);
};

/**
 * Get full verdict configuration based on verdict type
 */
export const getVerdictConfig = (verdictType: VerdictType): VerdictConfig => {
  const configs: Record<VerdictType, VerdictConfig> = {
    build: {
      type: "build",
      icon: CheckCircle,
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/20",
      label: "PROCEED TO MVP",
    },
    narrow: {
      type: "narrow",
      icon: AlertTriangle,
      color: "text-warning",
      bgColor: "bg-warning/10",
      borderColor: "border-warning/20",
      label: "BUILD ONLY IF NARROWED",
    },
    kill: {
      type: "kill",
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/20",
      label: "DO NOT BUILD",
    },
  };

  return configs[verdictType];
};

/**
 * Get fallback score based on verdict type (when no score in evaluation)
 */
export const getFallbackScore = (verdictType: VerdictType): number => {
  switch (verdictType) {
    case "build":
      return 75;
    case "narrow":
      return 55;
    case "kill":
      return 25;
  }
};
