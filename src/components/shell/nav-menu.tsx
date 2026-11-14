"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/components/shell/nav-items";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const GROUP_LABEL: Record<string, string> = {
  primary: "Ledger",
  system: "System",
};

export function NavMenu() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const groups = ["primary", "system"]
    .map((group) => ({
      group,
      items: navItems.filter((item) => item.group === group),
    }))
    .filter(({ items }) => items.length > 0);

  return (
    <nav aria-label="Main" className="flex flex-col gap-2">
      {groups.map(({ group, items }) => (
        <SidebarGroup key={group}>
          <SidebarGroupLabel className="text-muted-foreground">
            {GROUP_LABEL[group]}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const current =
                  item.match === "exact"
                    ? pathname === item.href
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={current}
                      tooltip={item.label}
                    >
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
