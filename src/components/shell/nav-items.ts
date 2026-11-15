import type { LucideIcon } from "lucide-react";
import { ActivityIcon, LandmarkIcon, WalletIcon } from "lucide-react";

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
    href: "/spending",
    label: "Spending",
    icon: WalletIcon,
    match: "prefix",
    group: "primary",
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: LandmarkIcon,
    match: "prefix",
    group: "primary",
  },
  {
    href: "/status",
    label: "System status",
    icon: ActivityIcon,
    match: "prefix",
    group: "system",
  },
];
