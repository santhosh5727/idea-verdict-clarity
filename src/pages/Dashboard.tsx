import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";

const mockIdeas = [
  {
    id: 1,
    title: "AI-powered Code Review Assistant",
    description: "Automated code review tool that learns from team preferences",
    verdict: "build" as const,
    confidence: 82,
    date: "Dec 17, 2025",
  },
  {
    id: 2,
    title: "Sustainable Fashion Marketplace",
    description: "Platform connecting eco-conscious consumers with sustainable brands",
    verdict: "narrow" as const,
    confidence: 65,
    date: "Dec 14, 2025",
  },
  {
    id: 3,
    title: "Generic Social Media App",
    description: "Another social platform without clear differentiation",
    verdict: "kill" as const,
    confidence: 91,
    date: "Dec 11, 2025",
  },
];

const Dashboard = () => {
  const buildCount = mockIdeas.filter((i) => i.verdict === "build").length;
  const narrowCount = mockIdeas.filter((i) => i.verdict === "narrow").length;
  const killCount = mockIdeas.filter((i) => i.verdict === "kill").length;

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
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">IV</span>
            </div>
            <span className="text-lg font-semibold text-foreground">Idea Verdict</span>
          </Link>

          <Link to="/evaluate">
            <Button variant="default" size="sm" className="rounded-lg">
              + New Evaluation
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="bg-gradient-to-r from-primary/5 via-background to-background min-h-[calc(100vh-64px)]">
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
            <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Build</p>
                  <p className="text-3xl font-bold text-foreground">{buildCount}</p>
                </div>
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
            </div>

            {/* Narrow */}
            <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Narrow</p>
                  <p className="text-3xl font-bold text-foreground">{narrowCount}</p>
                </div>
                <AlertCircle className="h-6 w-6 text-warning" />
              </div>
            </div>

            {/* Kill */}
            <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Kill</p>
                  <p className="text-3xl font-bold text-foreground">{killCount}</p>
                </div>
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </div>

          {/* Ideas List */}
          <div className="space-y-4">
            {mockIdeas.map((idea) => (
              <div
                key={idea.id}
                className="rounded-xl border border-border/50 bg-card p-5 shadow-sm"
              >
                <h3 className="font-semibold text-foreground">{idea.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{idea.description}</p>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  {getVerdictIcon(idea.verdict)}
                  {getVerdictLabel(idea.verdict)}
                  <span className="text-muted-foreground ml-2">{idea.confidence}% confidence</span>
                  <span className="text-muted-foreground ml-2">{idea.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
