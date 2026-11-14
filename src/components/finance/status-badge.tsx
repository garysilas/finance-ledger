import {
  CircleAlertIcon,
  CircleSlashIcon,
  ClockIcon,
  HistoryIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/utils";

export type StatusKind = "over" | "near" | "pending" | "stale" | "excluded";

const STYLE: Record<
  StatusKind,
  { icon: LucideIcon; label: string; classes: string }
> = {
  over: {
    icon: CircleAlertIcon,
    label: "Over budget",
    classes: "bg-status-over text-status-over-foreground",
  },
  near: {
    icon: TriangleAlertIcon,
    label: "Near limit",
    classes: "bg-status-near text-status-near-foreground",
  },
  pending: {
    icon: ClockIcon,
    label: "Pending",
    classes: "bg-status-pending text-status-pending-foreground",
  },
  stale: {
    icon: HistoryIcon,
    label: "Stale",
    classes: "bg-status-stale text-status-stale-foreground",
  },
  excluded: {
    icon: CircleSlashIcon,
    label: "Excluded",
    classes: "bg-muted text-muted-foreground",
  },
};

// Every status shows text and an icon, so meaning never rests on color.
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKind;
  label?: string;
  className?: string;
}) {
  const { icon: Icon, label: defaultLabel, classes } = STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        classes,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label ?? defaultLabel}
    </span>
  );
}
