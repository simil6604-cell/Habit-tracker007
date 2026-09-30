import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveTimetablePhoto, removeTimetablePhoto } from "@/lib/school/timetable-photo-actions";

/**
 * The photo of the timetable, shown at the size a phone can actually read.
 *
 * Tapping it opens the file itself, which is how you zoom into a 9-period
 * week on a small screen — the browser's own image viewer pinches and pans,
 * and anything built here would be a worse copy of it.
 */
export function TimetablePhoto({ imagePath }: { imagePath: string | null }) {
  if (!imagePath) {
    return (
      <form action={saveTimetablePhoto} className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-4">
        <p className="text-sm font-medium">No timetable photo yet</p>
        <p className="text-sm text-muted">
          Photograph the timetable your school gave you, or upload the file. It shows up here and on the School page —
          the one you glance at, next to the one the app plans with.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="photo"
            accept="image/*"
            required
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:text-foreground"
          />
          <Button type="submit" size="sm" variant="secondary">
            <ImageUp size={14} /> Save photo
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="timetable-photo">
      <a href={imagePath} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element -- a user upload of unknown size, served from our own authenticated route */}
        <img src={imagePath} alt="Your school timetable" className="w-full" />
      </a>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted">Tap the photo to open it full size and zoom in.</p>
        <form action={saveTimetablePhoto} className="flex items-center gap-2">
          <input
            type="file"
            name="photo"
            accept="image/*"
            required
            className="max-w-[11rem] text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-surface-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
          />
          <Button type="submit" size="sm" variant="outline">Replace</Button>
        </form>
        <form action={removeTimetablePhoto}>
          <Button type="submit" size="sm" variant="ghost" aria-label="Remove timetable photo">
            <Trash2 size={14} />
          </Button>
        </form>
      </div>
    </div>
  );
}
