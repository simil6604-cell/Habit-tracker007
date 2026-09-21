import { updateProfile } from "@/lib/football/actions";
import { FOOTBALL_POSITIONS, FOOTBALL_SKILLS } from "@/lib/data/football";
import { Button } from "@/components/ui/button";

export function ProfileForm({
  profile,
}: {
  profile?: { position: string; weaknesses: string | null; team: { name: string } | null } | null;
}) {
  const weaknesses = profile?.weaknesses ? profile.weaknesses.split(",").filter(Boolean) : [];

  return (
    <form action={updateProfile} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Position</label>
        <select name="position" defaultValue={profile?.position ?? "ST"} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {FOOTBALL_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label} ({p.value})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Team</label>
        <input name="teamName" defaultValue={profile?.team?.name ?? ""} placeholder="Team name" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Your weaknesses</label>
        <div className="flex flex-wrap gap-2">
          {FOOTBALL_SKILLS.map((s) => (
            <label key={s} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs">
              <input type="checkbox" name="weaknesses" value={s} defaultChecked={weaknesses.includes(s)} />
              {s}
            </label>
          ))}
        </div>
      </div>
      <Button type="submit" size="sm" className="self-start">Save profile</Button>
    </form>
  );
}
