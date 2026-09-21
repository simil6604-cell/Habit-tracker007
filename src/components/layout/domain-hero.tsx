import { cn } from "@/lib/utils";
import { FootballScene, GymScene } from "./hero-scenes";

const GRADIENTS: Record<string, string> = {
  school: "from-indigo-500 via-indigo-600 to-violet-700",
  gym: "from-orange-500 via-amber-600 to-red-600",
  football: "from-emerald-500 via-green-600 to-teal-700",
};

const SCENES: Partial<Record<string, React.ComponentType>> = {
  gym: GymScene,
  football: FootballScene,
};

export function DomainHero({
  domain,
  emoji,
  title,
  subtitle,
  actions,
}: {
  domain: "school" | "gym" | "football";
  emoji: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  const Scene = SCENES[domain];
  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-lg sm:p-7", GRADIENTS[domain])}>
      {Scene ? <Scene /> : (
        <>
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-black/10" />
        </>
      )}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-4xl shadow-inner backdrop-blur-sm">
            {emoji}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-white/85">{subtitle}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
