import { Link } from "react-router-dom";
import { CheckCircle, TrendingUp, Target, Users, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import logo from "@/assets/logo.png";

const Results = () => {
  // Mock result data
  const result = {
    verdict: "BUILD",
    confidence: 82,
    description: "This idea shows strong potential and deserves further development.",
    breakdown: [
      {
        title: "Market Opportunity",
        score: 85,
        description: "Strong market demand with clear pain points identified",
        icon: TrendingUp,
      },
      {
        title: "Solution Clarity",
        score: 78,
        description: "Well-defined solution with specific value proposition",
        icon: Target,
      },
      {
        title: "Target Audience",
        score: 80,
        description: "Clearly defined user segment with accessible market entry",
        icon: Users,
      },
      {
        title: "Differentiation",
        score: 75,
        description: "Unique approach but competitive landscape requires validation",
        icon: Clock,
      },
    ],
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

          <Link
            to="/dashboard"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            View All Ideas
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="bg-gradient-to-r from-primary/8 via-primary/3 to-background min-h-[calc(100vh-64px)]">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto max-w-3xl">
            {/* Verdict Card */}
            <div className="mb-8 rounded-xl border border-primary/20 bg-card/90 backdrop-blur-sm p-6 shadow-lg md:p-8">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <CheckCircle className="h-8 w-8 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-primary md:text-3xl">
                    {result.verdict}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground md:text-4xl">
                    {result.confidence}%
                  </p>
                  <p className="text-sm text-muted-foreground">Confidence</p>
                </div>
              </div>

              <p className="mt-4 text-muted-foreground">{result.description}</p>

              {/* Progress Bar */}
              <div className="mt-6">
                <Progress value={result.confidence} className="h-2" />
              </div>
            </div>

            {/* Assessment Breakdown */}
            <h2 className="mb-4 text-xl font-bold text-foreground">Assessment Breakdown</h2>

            <div className="space-y-4">
              {result.breakdown.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="group rounded-xl border border-border/50 bg-card/90 backdrop-blur-sm p-5 shadow-card hover:shadow-lg hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{item.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-primary">
                        {item.score}/100
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Results;
