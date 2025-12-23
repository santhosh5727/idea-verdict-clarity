import { Check, AlertTriangle, X, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  type: "build" | "narrow" | "kill";
  count: number;
}

const StatCard = ({ type, count }: StatCardProps) => {
  const config = {
    build: {
      label: "Build",
      icon: Check,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    narrow: {
      label: "Narrow",
      icon: AlertTriangle,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
    kill: {
      label: "Kill",
      icon: X,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
    },
  };

  const { label, icon: Icon, iconBg, iconColor } = config[type];

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{count}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
};

export default StatCard;
