import { Suspense } from "react";
import Link from "next/link";
import { NavMenu } from "@/components/shell/nav-menu";
import {
  HealthIndicator,
  HealthIndicatorFallback,
} from "@/components/shell/health-indicator";
import { ThemeControl } from "@/components/shell/theme-control";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2 p-1 in-data-[collapsible=icon]:p-0 in-data-[collapsible=icon]:justify-center">
          <Link
            href="/"
            className="truncate rounded-md px-1 text-lg font-semibold tracking-tight outline-ring/50 focus-visible:ring-[3px]"
          >
            Ledger
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMenu />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-1 p-1 in-data-[collapsible=icon]:items-center in-data-[collapsible=icon]:p-0">
          <Suspense fallback={<HealthIndicatorFallback />}>
            <HealthIndicator />
          </Suspense>
          <ThemeControl />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
