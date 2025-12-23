import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">IV</span>
            </div>
            <span className="text-lg font-semibold text-foreground">Idea Verdict</span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link to="/auth">
              <Button variant="default" size="sm" className="rounded-lg">
                Sign In
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 bg-gradient-to-r from-primary/5 via-background to-background">
        <div className="container mx-auto px-4 py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Know if your startup idea
              <br />
              deserves to exist.
            </h1>
            <p className="mb-10 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              An opinionated decision engine that evaluates your idea with clarity
              and honesty. No fluff, just a clear verdict: Build, Narrow, or Kill.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/evaluate">
                <Button className="rounded-lg px-8 py-6 text-base font-medium">
                  Evaluate My Idea
                </Button>
              </Link>
              <Button
                variant="outline"
                className="rounded-lg px-8 py-6 text-base font-medium border-border bg-card"
                asChild
              >
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>
          </div>
        </div>

        {/* Verdict Cards Section */}
        <section id="how-it-works" className="container mx-auto px-4 pb-20">
          <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            {/* BUILD Card */}
            <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="font-semibold text-primary">BUILD</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Strong market signal, clear differentiation, validated problem.
              </p>
            </div>

            {/* NARROW Card */}
            <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-warning" />
                <span className="font-semibold text-warning">NARROW</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Promising foundation, but scope or positioning needs refinement.
              </p>
            </div>

            {/* KILL Card */}
            <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="font-semibold text-destructive">KILL</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Critical flaws in market, uniqueness, or execution feasibility.
              </p>
            </div>
          </div>
        </section>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Built for founders who value honest feedback over false hope.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
