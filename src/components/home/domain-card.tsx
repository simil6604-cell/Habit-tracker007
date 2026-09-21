import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const GRADIENTS: Record<string, string> = {
  school: "from-indigo-500 via-indigo-600 to-violet-700",
  gym: "from-orange-500 via-amber-600 to-red-600",
  football: "from-emerald-500 via-green-600 to-teal-700",
};

export function DomainCard({
  href,
  domain,
  emoji,
  title,
  stats,
}: {
  href: string;
  domain: "school" | "gym" | "football";
  emoji: string;
  title: string;
  stats: string[];
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-h-[220px] flex-1 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-lg transition-transform hover:-translate-y-1",
        GRADIENTS[domain]
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-black/10" />

      <div className="relative z-10">
        <span className="text-5xl drop-shadow-sm">{emoji}</span>
        <h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3>
        <ul className="mt-2 space-y-0.5 text-sm text-white/85">
          {stats.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="relative z-10 flex items-center gap-1.5 text-sm font-medium">
        Optimize
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
