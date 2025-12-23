import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import IdeaCard from "@/components/IdeaCard";

const mockIdeas = [
  {
    id: 1,
    title: "AI-powered Code Review Assistant",
    description: "An intelligent tool that reviews code changes and suggests improvements using advanced AI models.",
    verdict: "build" as const,
    confidence: 82,
    date: "Dec 20, 2024",
  },
  {
    id: 2,
    title: "Sustainable Fashion Marketplace",
    description: "A platform connecting eco-conscious consumers with sustainable fashion brands and second-hand sellers.",
    verdict: "narrow" as const,
    confidence: 65,
    date: "Dec 18, 2024",
  },
  {
    id: 3,
    title: "Generic Social Media App",
    description: "Yet another social media platform for sharing photos and connecting with friends.",
    verdict: "kill" as const,
    confidence: 91,
    date: "Dec 15, 2024",
  },
  {
    id: 4,
    title: "B2B SaaS Analytics Platform",
    description: "Enterprise analytics solution for tracking business metrics and generating actionable insights.",
    verdict: "build" as const,
    confidence: 78,
    date: "Dec 12, 2024",
  },
];

const Dashboard = () => {
  const buildCount = mockIdeas.filter((i) => i.verdict === "build").length;
  const narrowCount = mockIdeas.filter((i) => i.verdict === "narrow").length;
  const killCount = mockIdeas.filter((i) => i.verdict === "kill").length;

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="container mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Your Ideas</h1>
          <p className="mt-1 text-muted-foreground">
            Track and review all your evaluated startup ideas
          </p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard type="build" count={buildCount} />
          <StatCard type="narrow" count={narrowCount} />
          <StatCard type="kill" count={killCount} />
        </div>

        {/* Ideas List */}
        <div className="space-y-4">
          {mockIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              title={idea.title}
              description={idea.description}
              verdict={idea.verdict}
              confidence={idea.confidence}
              date={idea.date}
            />
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
