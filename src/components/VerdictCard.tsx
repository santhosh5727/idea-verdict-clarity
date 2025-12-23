import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerdictCardProps {
  type: "build" | "narrow" | "kill";
  title: string;
  description: string;
}

const VerdictCard = ({ type, title, description }: VerdictCardProps) => {
  const config = {
    build: {
      icon: Check,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    narrow: {
      icon: AlertTriangle,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
    kill: {
      icon: X,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
    },
  };

  const { icon: Icon, iconBg, iconColor } = config[type];

  return (
    <div className="group rounded-xl border border-border/50 bg-card p-6 shadow-card transition-all duration-200 hover:shadow-soft hover:border-border">
      <div className={cn("mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("h-6 w-6", iconColor)} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
};

export default VerdictCard;
