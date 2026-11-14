"use client";

import {
  CircleCheckIcon,
  CircleXIcon,
  LoaderCircleIcon,
  SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";

export type HealthKind = "ok" | "settings" | "failed" | "checking";

const ICON: Record<HealthKind, typeof CircleCheckIcon> = {
  ok: CircleCheckIcon,
  settings: SettingsIcon,
  failed: CircleXIcon,
  checking: LoaderCircleIcon,
};

export function HealthLink({
  label,
  kind,
}: {
  label: string;
  kind: HealthKind;
}) {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const Icon = ICON[kind];
  const accessible = `Database: ${label}`;

  const link = (
    <Link
      href="/status"
      aria-label={accessible}
      className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm text-sidebar-foreground/80 outline-ring/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <Icon
        aria-hidden="true"
        className={
          kind === "checking"
            ? "size-4 shrink-0 motion-safe:animate-spin"
            : "size-4 shrink-0"
        }
      />
      <span className="truncate group-data-[collapsible=icon]:hidden">
        {label}
      </span>
    </Link>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent hidden={!collapsed} side="right" align="center">
        {accessible}
      </TooltipContent>
    </Tooltip>
  );
}
