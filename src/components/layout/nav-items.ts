export type NavItem = {
  href: string;
  label: string;
  emoji?: string;
  icon?: "home" | "calendar" | "tasks" | "analytics" | "settings" | "coach";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/school", label: "School", emoji: "🎓" },
  { href: "/gym", label: "Gym", emoji: "🏋️" },
  { href: "/football", label: "Football", emoji: "⚽" },
  { href: "/coach", label: "AI Coach", icon: "coach" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/coach", label: "Coach", icon: "coach" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/analytics", label: "Stats", icon: "analytics" },
];
