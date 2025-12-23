import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import VerdictCard from "@/components/VerdictCard";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Know if your startup idea deserves to exist.
          </h1>
          <p className="mb-10 text-lg text-muted-foreground md:text-xl">
            An opinionated decision engine that evaluates your idea with clarity and honesty. 
            No fluff, just a clear verdict: Build, Narrow, or Kill.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/evaluate">
              <Button variant="hero" size="xl">
                Evaluate My Idea
              </Button>
            </Link>
            <Button variant="heroOutline" size="xl" asChild>
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Verdict Cards Section */}
      <section id="how-it-works" className="container mx-auto px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <VerdictCard
            type="build"
            title="BUILD"
            description="Strong market signal, clear differentiation, validated problem."
          />
          <VerdictCard
            type="narrow"
            title="NARROW"
            description="Promising foundation, but scope or positioning needs refinement."
          />
          <VerdictCard
            type="kill"
            title="KILL"
            description="Critical flaws in market, uniqueness, or execution feasibility."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
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
