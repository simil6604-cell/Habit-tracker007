"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getNotePhotos,
  addNotePhoto,
  regenerateNoteSummary,
  deleteNotePhoto,
  type NotePhotoEntry,
} from "@/lib/school/note-photo-actions";

export function NotePhotoPanel({ topicId }: { topicId: string }) {
  const [photos, setPhotos] = useState<NotePhotoEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    startTransition(async () => setPhotos(await getNotePhotos(topicId)));
  }, [topicId]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fileInputRef.current?.files?.length) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addNotePhoto(topicId, formData);
      if ("error" in res) setError(res.error);
      else setPhotos(res);
      formRef.current?.reset();
    });
  }

  function regenerate(photoId: string) {
    setRegeneratingId(photoId);
    startTransition(async () => {
      setPhotos(await regenerateNoteSummary(topicId, photoId));
      setRegeneratingId(null);
    });
  }

  function remove(photoId: string) {
    startTransition(async () => setPhotos(await deleteNotePhoto(topicId, photoId)));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted">📷 Note photos → AI summary</p>
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          name="photo"
          type="file"
          accept="image/*"
          capture="environment"
          required
          className="text-xs text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-surface-muted file:px-2 file:py-1.5 file:text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Working…" : "Add photo"}
        </Button>
      </form>
      <p className="text-xs text-muted">
        Take or upload a photo of your notes — stored as-is, and summarized by a real AI when one&apos;s connected
        (see Settings). Illegible handwriting is called out honestly, never guessed.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}

      {photos === null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted">No note photos for this topic yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {photos.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
              <Image
                src={p.imagePath}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 rounded-md object-cover"
                unoptimized
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">{format(p.createdAt, "MMM d, HH:mm")}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => regenerate(p.id)}
                      disabled={pending}
                      className="text-muted hover:text-accent"
                      title="Regenerate summary"
                    >
                      <RefreshCw size={12} className={regeneratingId === p.id ? "animate-spin" : ""} />
                    </button>
                    <button onClick={() => remove(p.id)} className="text-muted hover:text-danger">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {p.summary ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{p.summary}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted">
                    No AI summary yet — connect a real AI in Settings, then hit refresh.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
