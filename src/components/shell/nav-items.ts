import type { LucideIcon } from "lucide-react";
import { ActivityIcon } from "lucide-react";

// The one registry every sidebar destination comes from. Later features
// append items; nothing not built is listed. Reserved order for later
// groups: Overview (Transactions and Budgets), Accounts, Chat, and the
// system group last.
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: "exact" | "prefix";
  group: "primary" | "system";
}

export const navItems: NavItem[] = [
  {
    href: "/status",
    label: "System status",
    icon: ActivityIcon,
    match: "prefix",
    group: "system",
  },
];
