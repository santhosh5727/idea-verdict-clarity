import { CheckCircle, XCircle, AlertTriangle, HelpCircle, RefreshCw, LucideIcon } from "lucide-react";

export type VerdictType = "build" | "narrow" | "rethink" | "kill" | "optional";

export interface VerdictConfig {
  type?: VerdictType;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

// Parse VIABILITY SCORE from evaluation text (supports both old and new format)
export const parseViabilityScore = (fullEvaluation: string): number | null => {
  const viabilityMatch = fullEvaluation.match(/VIABILITY SCORE:\s*(\d+)%?/i);
  if (viabilityMatch) {
    const score = parseInt(viabilityMatch[1], 10);
    if (!isNaN(score) && score >= 0 && score <= 100) return score;
  }
  const strengthMatch = fullEvaluation.match(/IDEA STRENGTH SCORE:\s*(\d+)%?/i);
  if (strengthMatch) {
    const score = parseInt(strengthMatch[1], 10);
    if (!isNaN(score) && score >= 0 && score <= 100) return score;
  }
  return null;
};

// Legacy alias
export const parseStrengthScore = parseViabilityScore;

// Parse EXECUTION DIFFICULTY from evaluation text
export const parseExecutionDifficulty = (fullEvaluation: string): string => {
  const match = fullEvaluation.match(/EXECUTION DIFFICULTY:\s*(LOW|MEDIUM|EXTREME)/i);
  return match ? match[1].toUpperCase() : "MEDIUM";
};

export const getVerdictFromScore = (score: number): VerdictType => {
  if (score >= 70) return "build";
  if (score >= 50) return "narrow";
  if (score >= 30) return "rethink";
  return "kill";
};

export const parseRawVerdict = (verdict: string): VerdictType => {
  const normalized = verdict.toUpperCase().trim();
  if (normalized.includes("PROCEED TO MVP") || (normalized.includes("BUILD") && !normalized.includes("NARROW") && !normalized.includes("DO NOT"))) return "build";
  if (normalized.includes("BUILD ONLY IF NARROWED") || normalized.includes("NARROW")) return "narrow";
  if (normalized === "RETHINK") return "rethink";
  if (normalized === "OPTIONAL") return "optional";
  return "kill";
};

export const getDefinitiveVerdict = (fullEvaluation: string, rawVerdict: string): VerdictType => {
  const score = parseViabilityScore(fullEvaluation);
  if (score !== null) return getVerdictFromScore(score);
  return parseRawVerdict(rawVerdict);
};

export const getVerdictConfig = (verdictType: VerdictType): VerdictConfig => {
  const configs: Record<VerdictType, VerdictConfig> = {
    build: { icon: CheckCircle, color: "text-primary", bgColor: "bg-primary/10", borderColor: "border-primary/20", label: "BUILD" },
    narrow: { icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning/10", borderColor: "border-warning/20", label: "BUILD ONLY IF NARROWED" },
    rethink: { icon: RefreshCw, color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20", label: "RETHINK" },
    kill: { icon: XCircle, color: "text-destructive", bgColor: "bg-destructive/10", borderColor: "border-destructive/20", label: "DO NOT BUILD" },
    optional: { icon: HelpCircle, color: "text-muted-foreground", bgColor: "bg-muted/10", borderColor: "border-border", label: "OPTIONAL" },
  };
  return configs[verdictType];
};

export const getFallbackScore = (verdictType: VerdictType): number => {
  switch (verdictType) {
    case "build": return 80;
    case "narrow": return 60;
    case "rethink": return 40;
    case "kill": return 20;
    case "optional": return 50;
    default: return 50;
  }
};
