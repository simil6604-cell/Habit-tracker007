import { Home, Calendar, ListChecks, BarChart3, Settings, Sparkles, GraduationCap } from "lucide-react";
import type { NavItem } from "./nav-items";

const ICONS = {
  home: Home,
  calendar: Calendar,
  tasks: ListChecks,
  analytics: BarChart3,
  settings: Settings,
  coach: Sparkles,
  schoolai: GraduationCap,
};

export function NavIcon({ item, size = 18 }: { item: NavItem; size?: number }) {
  if (item.emoji) {
    return <span style={{ fontSize: size }}>{item.emoji}</span>;
  }
  const Icon = item.icon ? ICONS[item.icon] : Home;
  return <Icon size={size} />;
}
