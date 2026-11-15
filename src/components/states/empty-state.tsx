import { CircleSlashIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/components/utils";

// The shared empty surface: a title, a description, and an optional action.
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = CircleSlashIcon,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Empty className={cn("gap-4 p-6", className)}>
      <EmptyHeader className="gap-2">
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          <h2 className="text-lg font-medium">{title}</h2>
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
