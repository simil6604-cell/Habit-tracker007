"use client";

import { useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { uploadBodyPhoto, deleteBodyPhoto } from "@/lib/gym/photo-actions";
import { Button } from "@/components/ui/button";

type BodyPhoto = { id: string; imagePath: string; caption: string | null; date: Date };

export function BodyPhotosPanel({ photos }: { photos: BodyPhoto[] }) {
  const [compareIds, setCompareIds] = useState<string[]>([]);

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const oldest = [...photos].sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  const newest = photos[0];
  const comparePhotos =
    compareIds.length === 2
      ? (compareIds.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as BodyPhoto[])
      : oldest && newest && oldest.id !== newest.id
        ? [oldest, newest]
        : [];

  return (
    <div className="flex flex-col gap-4">
      <form action={uploadBodyPhoto} className="flex flex-wrap gap-2">
        <input
          name="photo"
          type="file"
          accept="image/*"
          required
          className="text-xs text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-surface-muted file:px-2 file:py-1.5 file:text-xs"
        />
        <input
          name="caption"
          placeholder="Caption (optional)"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary">Add photo</Button>
      </form>
      <p className="text-xs text-muted">
        Just your own visual log, stored as-is — nothing here analyzes body photos. Pick two below (or leave it
        to the oldest/newest) to compare progress side by side.
      </p>

      {photos.length === 0 ? (
        <p className="text-sm text-muted">No progress photos yet — add your first one above.</p>
      ) : (
        <>
          {comparePhotos.length === 2 && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-muted p-3">
              {comparePhotos.map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                    <Image src={p.imagePath} alt={p.caption ?? ""} fill className="object-cover" unoptimized />
                  </div>
                  <span className="text-xs text-muted">{format(p.date, "MMM d, yyyy")}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="group relative">
                <button
                  type="button"
                  onClick={() => toggleCompare(p.id)}
                  className={`relative block aspect-square w-full overflow-hidden rounded-lg ring-2 transition ${
                    compareIds.includes(p.id) ? "ring-accent" : "ring-transparent"
                  }`}
                >
                  <Image src={p.imagePath} alt={p.caption ?? ""} fill className="object-cover" unoptimized />
                </button>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] text-muted">{format(p.date, "MMM d")}</span>
                  <form action={deleteBodyPhoto.bind(null, p.id)}>
                    <button type="submit" className="text-muted hover:text-danger">
                      <Trash2 size={12} />
                    </button>
                  </form>
                </div>
                {p.caption && <p className="truncate text-[11px] text-muted">{p.caption}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
