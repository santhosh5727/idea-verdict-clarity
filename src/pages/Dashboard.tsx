import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { parseRawVerdict, VerdictType } from "@/lib/verdictUtils";
import logo from "@/assets/logo.png";

interface Evaluation {
  id: string;
  idea_problem: string;
  verdict_type: string;
  created_at: string;
}

const Dashboard = () => {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvaluations = async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("id, idea_problem, verdict_type, created_at")
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

  // Use the centralized verdict parsing from verdictUtils
  const getVerdict = (verdictType: string): VerdictType => parseRawVerdict(verdictType);

  const buildCount = evaluations.filter((e) => getVerdict(e.verdict_type) === "build").length;
  const narrowCount = evaluations.filter((e) => getVerdict(e.verdict_type) === "narrow").length;
  const killCount = evaluations.filter((e) => getVerdict(e.verdict_type) === "kill").length;

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case "build":
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case "narrow":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case "kill":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getVerdictLabel = (verdict: string) => {
    switch (verdict) {
      case "build":
        return <span className="text-primary font-medium">BUILD</span>;
      case "narrow":
        return <span className="text-warning font-medium">NARROW</span>;
      case "kill":
        return <span className="text-destructive font-medium">KILL</span>;
      default:
        return null;
    }
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
            <p className="mt-1 text-muted-foreground">
              Track and review all your evaluated startup ideas
            </p>
          </div>

          {/* Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {/* Build */}
            <div className="rounded-xl border border-primary/20 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-primary/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Build</p>
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
                  <p className="text-sm text-muted-foreground">Narrow</p>
                  <p className="text-3xl font-bold text-foreground">{narrowCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-warning/10">
                  <AlertCircle className="h-6 w-6 text-warning" />
                </div>
              </div>
            </div>

            {/* Kill */}
            <div className="rounded-xl border border-destructive/20 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-destructive/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Kill</p>
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
                <p className="text-muted-foreground">No evaluations yet.</p>
                <Link to="/evaluate">
                  <Button className="mt-4">Evaluate Your First Idea</Button>
                </Link>
              </div>
            ) : (
              evaluations.map((evaluation) => {
                const verdict = getVerdict(evaluation.verdict_type);
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
                      {evaluation.idea_problem}
                    </h3>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {getVerdictIcon(verdict)}
                      {getVerdictLabel(verdict)}
                      <span className="text-muted-foreground ml-2">{date}</span>
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
