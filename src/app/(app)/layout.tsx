import { cookies } from "next/headers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const SIDEBAR_COOKIE_NAME = "sidebar_state";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const defaultOpen = store.get(SIDEBAR_COOKIE_NAME)?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:start-4 focus:top-4"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset id="main" tabIndex={-1} className="outline-none">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger className="-ms-1" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
