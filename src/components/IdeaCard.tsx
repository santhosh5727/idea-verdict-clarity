import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface IdeaCardProps {
  title: string;
  description: string;
  verdict: "build" | "narrow" | "kill";
  confidence: number;
  date: string;
}

const IdeaCard = ({ title, description, verdict, confidence, date }: IdeaCardProps) => {
  const verdictConfig = {
    build: {
      label: "BUILD",
      icon: Check,
      bg: "bg-primary/10",
      text: "text-primary",
      border: "border-primary/20",
    },
    narrow: {
      label: "NARROW",
      icon: AlertTriangle,
      bg: "bg-warning/10",
      text: "text-warning",
      border: "border-warning/20",
    },
    kill: {
      label: "KILL",
      icon: X,
      bg: "bg-destructive/10",
      text: "text-destructive",
      border: "border-destructive/20",
    },
  };

  const config = verdictConfig[verdict];
  const Icon = config.icon;

  return (
    <div className="group rounded-xl border border-border/50 bg-card p-5 shadow-card transition-all duration-200 hover:shadow-soft hover:border-border">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="mb-1 text-base font-semibold text-foreground truncate">{title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        </div>
        
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <div className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
            config.bg,
            config.border
          )}>
            <Icon className={cn("h-3.5 w-3.5", config.text)} />
            <span className={cn("text-xs font-semibold", config.text)}>{config.label}</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{confidence}% confidence</span>
            <span>•</span>
            <span>{date}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdeaCard;
