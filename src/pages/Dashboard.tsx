import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { getDefinitiveVerdict, getVerdictConfig, parseViabilityScore, VerdictType } from "@/lib/verdictUtils";
import logo from "@/assets/logo.png";

interface Evaluation {
  id: string;
  project_name: string | null;
  idea_problem: string;
  verdict_type: string;
  full_verdict_text: string;
  created_at: string;
}

const Dashboard = () => {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvaluations = async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("id, project_name, idea_problem, verdict_type, full_verdict_text, created_at")
        .order("created_at", { ascending: false });
      
      if (error) {
        logError("Failed to fetch evaluations:", error);
      } else {
        setEvaluations(data || []);
      }
      setLoading(false);
    };
    fetchEvaluations();
  }, []);

  // Use score-based deterministic verdict (SINGLE SOURCE OF TRUTH)
  const getVerdict = (evaluation: Evaluation): VerdictType => 
    getDefinitiveVerdict(evaluation.full_verdict_text, evaluation.verdict_type);

  const buildCount = evaluations.filter((e) => getVerdict(e) === "build").length;
  const narrowCount = evaluations.filter((e) => getVerdict(e) === "narrow").length;
  const rethinkCount = evaluations.filter((e) => getVerdict(e) === "rethink").length;
  const killCount = evaluations.filter((e) => getVerdict(e) === "kill").length;

  // Get score for display
  const getScore = (evaluation: Evaluation): number | null => 
    parseViabilityScore(evaluation.full_verdict_text);

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case "build":
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case "narrow":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case "rethink":
        return <RefreshCw className="h-4 w-4 text-orange-500" />;
      case "kill":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getVerdictLabel = (verdict: string, score: number | null) => {
    const config = getVerdictConfig(verdict as VerdictType);
    const scoreText = score !== null ? ` — ${score}%` : "";
    
    switch (verdict) {
      case "build":
        return <span className="text-primary font-medium">{config.label}{scoreText}</span>;
      case "narrow":
        return <span className="text-warning font-medium">{config.label}{scoreText}</span>;
      case "rethink":
        return <span className="text-orange-500 font-medium">{config.label}{scoreText}</span>;
      case "kill":
        return <span className="text-destructive font-medium">{config.label}{scoreText}</span>;
      default:
        return null;
    }
  };

  // Get display name: prefer project_name, fallback to truncated idea_problem
  const getDisplayName = (evaluation: Evaluation): string => {
    if (evaluation.project_name) {
      return evaluation.project_name;
    }
    // Truncate idea_problem to ~60 chars
    const problem = evaluation.idea_problem;
    if (problem.length > 60) {
      return problem.substring(0, 57) + "...";
    }
    return problem;
  };

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Idea Verdict" 
              className="h-12 md:h-14 w-auto"
              style={{ filter: 'hue-rotate(-10deg)' }}
            />
          </Link>

          <Link to="/evaluate">
            <Button variant="default" size="sm" className="rounded-lg shadow-md hover:shadow-lg transition-shadow">
              + New Evaluation
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="bg-gradient-to-r from-primary/8 via-primary/3 to-background min-h-[calc(100vh-64px)]">
        <div className="container mx-auto px-4 py-8 md:py-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Your Ideas</h1>
            <p className="mt-1 text-foreground/70">
              Track and review all your evaluated startup ideas
            </p>
          </div>

          {/* Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            {/* Build */}
            <div className="rounded-xl border border-primary/20 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-primary/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/70">Build</p>
                  <p className="text-3xl font-bold text-foreground">{buildCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-primary/10">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>

            {/* Narrow */}
            <div className="rounded-xl border border-warning/20 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-warning/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/70">Narrow</p>
                  <p className="text-3xl font-bold text-foreground">{narrowCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-warning/10">
                  <AlertCircle className="h-6 w-6 text-warning" />
                </div>
              </div>
            </div>

            {/* Rethink */}
            <div className="rounded-xl border border-orange-500/20 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-orange-500/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/70">Rethink</p>
                  <p className="text-3xl font-bold text-foreground">{rethinkCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <RefreshCw className="h-6 w-6 text-orange-500" />
                </div>
              </div>
            </div>

            {/* Kill */}
            <div className="rounded-xl border border-destructive/20 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-destructive/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground/70">Do Not Build</p>
                  <p className="text-3xl font-bold text-foreground">{killCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-destructive/10">
                  <XCircle className="h-6 w-6 text-destructive" />
                </div>
              </div>
            </div>
          </div>

          {/* Ideas List */}
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : evaluations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-foreground/70">No evaluations yet.</p>
                <Link to="/evaluate">
                  <Button className="mt-4">Evaluate Your First Idea</Button>
                </Link>
              </div>
            ) : (
            evaluations.map((evaluation) => {
                const verdict = getVerdict(evaluation);
                const score = getScore(evaluation);
                const date = new Date(evaluation.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                return (
                  <Link
                    key={evaluation.id}
                    to={`/results?id=${evaluation.id}`}
                    className="block group rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-primary/30 transition-all duration-300"
                  >
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {getDisplayName(evaluation)}
                    </h3>
                    {evaluation.project_name && (
                      <p className="text-xs text-foreground/60 mt-1 line-clamp-1">
                        {evaluation.idea_problem.substring(0, 80)}...
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {getVerdictIcon(verdict)}
                      {getVerdictLabel(verdict, score)}
                      <span className="text-foreground/60 ml-2">{date}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
