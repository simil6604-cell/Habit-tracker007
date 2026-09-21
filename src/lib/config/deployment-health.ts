import { UPLOAD_ROOT } from "@/lib/uploads/save-image";
// The same two rules the Settings setup card uses. Kept in one place on
// purpose: two copies of "is this inside the app directory?" drift, and then
// the banner and the card contradict each other about whether your data is
// safe.
import { insideAppDirectory, sqliteFilePath } from "./setup-checks";

/**
 * Catches a deployment that will lose your data, while there is still time to
 * fix it.
 *
 * Both failure modes here are silent by nature: the app starts, works, and
 * looks correct — the data only disappears at the *next* deploy, long after
 * the mistake was made, with nothing connecting cause to effect. A note in the
 * README does not prevent that; a check that runs in the deployment does.
 *
 * Only in production. Writing inside the project directory is exactly what you
 * want on your own machine.
 */
export type DeploymentWarning = { problem: string; fix: string };

export function getDeploymentWarnings(): DeploymentWarning[] {
  if (process.env.NODE_ENV !== "production") return [];

  const warnings: DeploymentWarning[] = [];

  const dbFile = sqliteFilePath(process.env.DATABASE_URL);
  if (dbFile && insideAppDirectory(dbFile)) {
    warnings.push({
      problem:
        "The database is stored inside the app directory, which is rebuilt on every deploy. Every account, subject, note and log will be deleted the next time this app deploys.",
      fix: "Point DATABASE_URL at a persistent disk — on Render, mount a disk at /var/data and set DATABASE_URL to file:/var/data/prod.db.",
    });
  }

  if (insideAppDirectory(UPLOAD_ROOT)) {
    warnings.push({
      problem:
        "Uploaded photos are stored inside the app directory, which is rebuilt on every deploy. Every note photo, meal photo and progress photo will be deleted the next time this app deploys.",
      fix: "Set UPLOAD_DIR to a path on a persistent disk — on Render, /var/data/uploads.",
    });
  }

  return warnings;
}
