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

// Parse EXECUTION DIFFICULTY from evaluation text (no default - must be derived)
export const parseExecutionDifficulty = (fullEvaluation: string): string => {
  // Match various difficulty terms
  const match = fullEvaluation.match(/EXECUTION DIFFICULTY:\s*(EASY|LOW|MEDIUM|MODERATE|HARD|HIGH|EXTREME)/i);
  if (match) {
    const raw = match[1].toUpperCase();
    // Normalize values
    if (raw === "EASY" || raw === "LOW") return "LOW";
    if (raw === "MEDIUM" || raw === "MODERATE") return "MEDIUM";
    if (raw === "HARD" || raw === "HIGH" || raw === "EXTREME") return "EXTREME";
  }
  // Return empty string if not found - UI should handle this case
  return "";
};

// Score to verdict mapping (STRICT bands)
// >65: BUILD, 41-65: NARROW, 31-40: RETHINK, 0-30: DO NOT BUILD (KILL)
export const getVerdictFromScore = (score: number): VerdictType => {
  if (score > 65) return "build";
  if (score >= 41) return "narrow";
  if (score >= 31) return "rethink";
  return "kill";
};

export const parseRawVerdict = (verdict: string): VerdictType => {
  const normalized = verdict.toUpperCase().trim();
  if (normalized.includes("PROCEED TO MVP") || (normalized === "BUILD") || (normalized.includes("BUILD") && !normalized.includes("NARROW") && !normalized.includes("DO NOT") && !normalized.includes("RETHINK"))) return "build";
  if (normalized.includes("BUILD ONLY IF NARROWED") || normalized === "NARROW" || normalized.includes("NARROW")) return "narrow";
  if (normalized.includes("RETHINK")) return "rethink";
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
    narrow: { icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning/10", borderColor: "border-warning/20", label: "NARROW" },
    rethink: { icon: RefreshCw, color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20", label: "RETHINK" },
    kill: { icon: XCircle, color: "text-destructive", bgColor: "bg-destructive/10", borderColor: "border-destructive/20", label: "DO NOT BUILD" },
    optional: { icon: HelpCircle, color: "text-muted-foreground", bgColor: "bg-muted/10", borderColor: "border-border", label: "OPTIONAL" },
  };
  return configs[verdictType];
};

// Fallback scores aligned with verdict bands
export const getFallbackScore = (verdictType: VerdictType): number => {
  switch (verdictType) {
    case "build": return 75;      // >65 range
    case "narrow": return 53;     // 41-65 range
    case "rethink": return 35;    // 31-40 range
    case "kill": return 20;       // 0-30 range
    case "optional": return 50;
    default: return 50;
  }
};
