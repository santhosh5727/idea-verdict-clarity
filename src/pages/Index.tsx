import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, XCircle, LogOut } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import F1CarAnimation from "@/components/F1CarAnimation";
import AmbientAnimation from "@/components/AmbientAnimation";
import NovaAssistant from "@/components/NovaAssistant";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.png";

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
    navigate("/");
  };

  const getInitial = (email: string | undefined) => {
    if (!email) return "U";
    return email.charAt(0).toUpperCase();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-3 flex-shrink-0">
            <img 
              src={logo} 
              alt="Idea Verdict" 
              className="h-14 md:h-16 w-auto brightness-100 saturate-100"
              style={{ filter: 'hue-rotate(-10deg)' }}
            />
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground whitespace-nowrap"
            >
              Dashboard
            </Link>
            
            {user ? (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
                    {getInitial(user.email)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="end">
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </PopoverContent>
              </Popover>
            ) : (
              <Link to="/auth">
                <Button variant="default" size="sm" className="rounded-lg shadow-md hover:shadow-lg transition-shadow">
                  Sign In
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative flex-1 bg-gradient-to-r from-primary/8 via-primary/3 to-background overflow-hidden">
        <F1CarAnimation />
        
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
              Evaluate Your Startup Idea
              <br />
              <span className="gradient-text">Through a Profitability-First Lens</span>
            </h1>
            <p className="mb-8 sm:mb-10 text-base sm:text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto px-2">
              IdeaVerdict evaluates startup ideas with a bootstrap-oriented, execution-focused lens. 
              Built to help founders build sustainable businesses — not pitch decks or hype-driven moonshots.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 sm:flex-row px-4 sm:px-0">
              <Link to="/evaluate" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto rounded-lg px-8 py-6 text-base font-medium shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]">
                  Evaluate My Idea
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full sm:w-auto rounded-lg px-8 py-6 text-base font-medium border-primary/20 bg-card/80 backdrop-blur-sm hover:bg-primary/5 hover:border-primary/40 transition-all"
                asChild
              >
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>

            {/* Nova AI Assistant */}
            <NovaAssistant />
          </div>
        </div>

        {/* Benefits Section */}
        <section className="relative container mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-semibold text-center text-foreground mb-8">
              What We Evaluate
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
              <li className="flex items-center gap-3 p-4 rounded-lg bg-card/60 backdrop-blur-sm border border-border/40">
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-foreground/90">Problem clarity check</span>
              </li>
              <li className="flex items-center gap-3 p-4 rounded-lg bg-card/60 backdrop-blur-sm border border-border/40">
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-foreground/90">Target user validation</span>
              </li>
              <li className="flex items-center gap-3 p-4 rounded-lg bg-card/60 backdrop-blur-sm border border-border/40">
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-foreground/90">Competitive analysis</span>
              </li>
              <li className="flex items-center gap-3 p-4 rounded-lg bg-card/60 backdrop-blur-sm border border-border/40">
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-foreground/90">Monetization review</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Verdict Cards Section with Ambient Animation */}
        <section id="how-it-works" className="relative container mx-auto px-4 sm:px-6 pb-12 sm:pb-20">
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

        {/* FAQ Section */}
        <section className="relative container mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-semibold text-center text-foreground mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              <details className="group rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 sm:p-6">
                <summary className="flex cursor-pointer items-center justify-between font-medium text-foreground">
                  <span>How do I know if my startup idea is good?</span>
                  <span className="ml-4 flex-shrink-0 text-muted-foreground group-open:rotate-180 transition-transform">↓</span>
                </summary>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  A good startup idea solves a real problem for a specific audience, has a clear path to monetization, and offers something competitors don't. IdeaVerdict analyzes these factors and gives you an honest verdict — Build, Narrow, or Kill — so you know where you stand before investing time and money.
                </p>
              </details>
              
              <details className="group rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 sm:p-6">
                <summary className="flex cursor-pointer items-center justify-between font-medium text-foreground">
                  <span>Should I build my startup idea or drop it?</span>
                  <span className="ml-4 flex-shrink-0 text-muted-foreground group-open:rotate-180 transition-transform">↓</span>
                </summary>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  That depends on problem-solution fit, target market clarity, and competitive differentiation. Instead of guessing, use IdeaVerdict to get structured AI feedback. You'll receive a clear recommendation with reasoning — helping you decide whether to move forward, refine your approach, or pivot to a better idea.
                </p>
              </details>
              
              <details className="group rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 sm:p-6">
                <summary className="flex cursor-pointer items-center justify-between font-medium text-foreground">
                  <span>How to validate a business idea quickly?</span>
                  <span className="ml-4 flex-shrink-0 text-muted-foreground group-open:rotate-180 transition-transform">↓</span>
                </summary>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  Traditional validation takes weeks of customer interviews and market research. IdeaVerdict speeds this up by evaluating your problem statement, solution, target users, and differentiation in minutes. It's not a replacement for real customer feedback, but it's the fastest way to stress-test your idea before you build anything.
                </p>
              </details>
            </div>
          </div>
        </section>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 bg-gradient-to-r from-primary/5 to-background">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Built for founders who value survival over hype.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            Profitability-first. Bootstrap-oriented. Honest by design.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
