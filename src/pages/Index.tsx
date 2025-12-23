import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";
import F1CarAnimation from "@/components/F1CarAnimation";
import AmbientAnimation from "@/components/AmbientAnimation";
import logo from "@/assets/logo.png";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Idea Verdict" 
              className="h-12 md:h-14 w-auto brightness-100 saturate-100"
              style={{ filter: 'hue-rotate(-10deg)' }}
            />
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link to="/auth">
              <Button variant="default" size="sm" className="rounded-lg shadow-md hover:shadow-lg transition-shadow">
                Sign In
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative flex-1 bg-gradient-to-r from-primary/8 via-primary/3 to-background overflow-hidden">
        <F1CarAnimation />
        
        <div className="container mx-auto px-4 py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Know if your startup idea
              <br />
              <span className="gradient-text">deserves to exist.</span>
            </h1>
            <p className="mb-10 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              An opinionated decision engine that evaluates your idea with clarity
              and honesty. No fluff, just a clear verdict: Build, Narrow, or Kill.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/evaluate">
                <Button className="rounded-lg px-8 py-6 text-base font-medium shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]">
                  Evaluate My Idea
                </Button>
              </Link>
              <Button
                variant="outline"
                className="rounded-lg px-8 py-6 text-base font-medium border-primary/20 bg-card/80 backdrop-blur-sm hover:bg-primary/5 hover:border-primary/40 transition-all"
                asChild
              >
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>
          </div>
        </div>

        {/* Verdict Cards Section with Ambient Animation */}
        <section id="how-it-works" className="relative container mx-auto px-4 pb-20">
          <AmbientAnimation />
          
          <div className="relative z-10 grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            {/* BUILD Card */}
            <div className="group rounded-xl border border-primary/20 bg-card/90 backdrop-blur-sm p-6 shadow-card hover:shadow-lg hover:border-primary/40 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <CheckCircle className="h-5 w-5 text-primary" />
                </div>
                <span className="font-semibold text-primary">BUILD</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Strong market signal, clear differentiation, validated problem.
              </p>
            </div>

            {/* NARROW Card */}
            <div className="group rounded-xl border border-warning/20 bg-card/90 backdrop-blur-sm p-6 shadow-card hover:shadow-lg hover:border-warning/40 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-warning/10">
                  <AlertCircle className="h-5 w-5 text-warning" />
                </div>
                <span className="font-semibold text-warning">NARROW</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Promising foundation, but scope or positioning needs refinement.
              </p>
            </div>

            {/* KILL Card */}
            <div className="group rounded-xl border border-destructive/20 bg-card/90 backdrop-blur-sm p-6 shadow-card hover:shadow-lg hover:border-destructive/40 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-destructive/10">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <span className="font-semibold text-destructive">KILL</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Critical flaws in market, uniqueness, or execution feasibility.
              </p>
            </div>
          </div>
        </section>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 bg-gradient-to-r from-primary/5 to-background">
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
