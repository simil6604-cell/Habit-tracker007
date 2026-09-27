import { redirect } from "next/navigation";

/**
 * The school AI is a section of /school now, not a page of its own.
 *
 * Kept as a redirect rather than deleted: this address is in the browser
 * history of anyone who used it, and a 404 there would read as the feature
 * having been taken away rather than moved. Rendering a second copy of the
 * chat here instead would mean two places to keep in step.
 */
export default function SchoolAIPage() {
  redirect("/school#school-ai");
}
