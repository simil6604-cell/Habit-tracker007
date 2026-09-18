import { toYouTubeEmbed } from "@/lib/utils/video";

export function VideoReference({ url }: { url: string }) {
  const embed = toYouTubeEmbed(url);
  if (embed) {
    return (
      <div className="aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-border">
        <iframe src={embed} className="h-full w-full" allowFullScreen title="Saved reference video" />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">
      Saved reference ↗
    </a>
  );
}
