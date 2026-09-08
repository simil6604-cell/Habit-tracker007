import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { updateProfileName, updateOptimizationDomains, updateNutritionSettings } from "@/lib/settings/actions";
import { isRealAIConfigured } from "@/lib/ai/provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { DeleteAccountButton } from "@/components/settings/danger-zone";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card className="mt-6">
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form action={updateProfileName} className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">Name</label>
              <input name="name" defaultValue={user.name ?? ""} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Save</Button>
          </form>
          <p className="mt-2 text-xs text-muted">{user.email}</p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>What are you optimizing?</CardTitle></CardHeader>
        <CardContent>
          <form action={updateOptimizationDomains} className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="optimizeSchool" defaultChecked={user.optimizeSchool} /> 🎓 School</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="optimizeGym" defaultChecked={user.optimizeGym} /> 🏋️ Gym</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="optimizeFootball" defaultChecked={user.optimizeFootball} /> ⚽ Football</label>
            <Button type="submit" size="sm" variant="secondary" className="self-start">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Nutrition & Calorie Estimates</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Optional — used only to roughly estimate calories burned per workout and show a daily balance. Never a
            diet target the app pushes on you.
          </p>
          <form action={updateNutritionSettings} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Body weight (kg)</label>
              <input name="weightKg" type="number" min={20} max={250} defaultValue={user.weightKg ?? ""} className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Target weight (kg, your own goal)</label>
              <input name="targetWeightKg" type="number" min={20} max={250} defaultValue={user.targetWeightKg ?? ""} className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Daily calorie goal (optional, your own number)</label>
              <input name="dailyCalorieGoal" type="number" min={0} defaultValue={user.dailyCalorieGoal ?? ""} className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Daily protein goal (g)</label>
              <input name="dailyProteinGoalG" type="number" min={0} defaultValue={user.dailyProteinGoalG} className="w-32 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Baseline Assessments</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted">See or retake your &quot;where do you stand&quot; self-assessment for each area.</p>
          <Link href="/assessment"><Button variant="outline" size="sm">Open</Button></Link>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted">Light / dark mode</p>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>AI Coach</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {isRealAIConfigured
              ? "Connected to a real Claude-backed AI — genuine subject tutoring in School (framed for your Cambridge IGCSE/AS/A-Level level) plus richer AI Coach chat replies."
              : "Running on the built-in rule-based coach — it only ever reasons over your own stored data. Set ANTHROPIC_API_KEY in your .env to enable real subject tutoring and chat."}
          </p>
          <Badge variant={isRealAIConfigured ? "success" : "accent"}>{isRealAIConfigured ? "LLM connected" : "Rule-based"}</Badge>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Data & Privacy</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Your data is stored in this app&apos;s own database and is never used to generate fake syllabus content,
            league data, or medical advice. This app does not diagnose health conditions or recommend extreme diets or
            training — if something feels physically or mentally off, please talk to a parent, coach, or doctor.
          </p>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-sm font-medium">Delete account</p>
            <DeleteAccountButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
