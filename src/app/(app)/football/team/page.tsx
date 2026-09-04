import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { addStanding, deleteStanding } from "@/lib/football/actions";
import { analyzeTable } from "@/lib/football/table-analysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

export default async function FootballTeamPage() {
  const session = await auth();
  const userId = session!.user.id;

  const profile = await prisma.footballProfile.findUnique({
    where: { userId },
    include: { team: { include: { standings: { orderBy: { rank: "asc" } } } } },
  });
  if (!profile?.team) redirect("/football");

  const weaknesses = profile.weaknesses ? profile.weaknesses.split(",").filter(Boolean) : [];
  const analysis = analyzeTable(profile.team.standings, profile.team.name, weaknesses);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">{profile.team.name}</h1>
      <p className="mt-1 text-muted">
        Manual data mode — no official league API is connected, so enter standings yourself. Nothing here is invented.
      </p>

      {analysis && (
        <Card className="mt-6">
          <CardHeader><CardTitle>AI Analysis</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>Current position: <strong>{analysis.mine.rank}</strong></span>
              <span>Points: <strong>{analysis.mine.points}</strong></span>
              <span>Goal difference: <strong>{analysis.goalDiff >= 0 ? "+" : ""}{analysis.goalDiff}</strong></span>
            </div>
            <ul className="flex flex-col gap-1 text-sm text-muted">
              {analysis.insights.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader><CardTitle>League Table</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={addStanding} className="grid grid-cols-2 gap-2 sm:grid-cols-9">
            <input name="rank" type="number" placeholder="#" required className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="teamName" placeholder="Team" required className="col-span-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="played" type="number" placeholder="P" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="won" type="number" placeholder="W" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="drawn" type="number" placeholder="D" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="lost" type="number" placeholder="L" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="goalsFor" type="number" placeholder="GF" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="goalsAgainst" type="number" placeholder="GA" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="points" type="number" placeholder="Pts" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <Button type="submit" size="sm" variant="secondary" className="col-span-2 sm:col-span-1">Add</Button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Team</th>
                  <th className="py-2 pr-2">P</th>
                  <th className="py-2 pr-2">W</th>
                  <th className="py-2 pr-2">D</th>
                  <th className="py-2 pr-2">L</th>
                  <th className="py-2 pr-2">GF</th>
                  <th className="py-2 pr-2">GA</th>
                  <th className="py-2 pr-2">Pts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profile.team.standings.map((s) => (
                  <tr key={s.id} className={`border-b border-border/60 ${s.teamName.toLowerCase() === profile.team!.name.toLowerCase() ? "bg-accent/10 font-medium" : ""}`}>
                    <td className="py-2 pr-2">{s.rank}</td>
                    <td className="py-2 pr-2">
                      {s.teamName}
                      {s.teamName.toLowerCase() === profile.team!.name.toLowerCase() && <Badge variant="accent" className="ml-2">You</Badge>}
                    </td>
                    <td className="py-2 pr-2">{s.played}</td>
                    <td className="py-2 pr-2">{s.won}</td>
                    <td className="py-2 pr-2">{s.drawn}</td>
                    <td className="py-2 pr-2">{s.lost}</td>
                    <td className="py-2 pr-2">{s.goalsFor}</td>
                    <td className="py-2 pr-2">{s.goalsAgainst}</td>
                    <td className="py-2 pr-2">{s.points}</td>
                    <td className="py-2 text-right">
                      <form action={deleteStanding.bind(null, s.id)}>
                        <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
                      </form>
                    </td>
                  </tr>
                ))}
                {profile.team.standings.length === 0 && (
                  <tr><td colSpan={10} className="py-4 text-center text-sm text-muted">No standings entered yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
