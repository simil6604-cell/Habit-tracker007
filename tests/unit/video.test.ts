import { describe, expect, it } from "vitest";
import { toYouTubeEmbed } from "@/lib/utils/video";

/**
 * The return value of this function goes straight into an <iframe src>, so
 * what it accepts as "a YouTube link" is a security boundary and not just a
 * convenience.
 */
describe("toYouTubeEmbed", () => {
  it("embeds the ordinary forms", () => {
    expect(toYouTubeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(toYouTubeEmbed("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(toYouTubeEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(toYouTubeEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(toYouTubeEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("refuses a host that merely contains youtube.com", () => {
    expect(toYouTubeEmbed("https://youtube.com.attacker.example/embed/x")).toBeNull();
    expect(toYouTubeEmbed("https://notyoutu.be/dQw4w9WgXcQ")).toBeNull();
    expect(toYouTubeEmbed("https://evil.example/?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("never echoes the URL it was given back into the iframe", () => {
    const out = toYouTubeEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&origin=evil.example");
    expect(out).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("refuses a non-http scheme and junk", () => {
    expect(toYouTubeEmbed("javascript:alert(1)")).toBeNull();
    expect(toYouTubeEmbed("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(toYouTubeEmbed("not a url")).toBeNull();
    expect(toYouTubeEmbed("")).toBeNull();
  });

  it("refuses an id that is not an id", () => {
    expect(toYouTubeEmbed("https://youtu.be/../../etc/passwd")).toBeNull();
    expect(toYouTubeEmbed("https://www.youtube.com/watch?v=")).toBeNull();
    expect(toYouTubeEmbed("https://www.youtube.com/")).toBeNull();
  });
});
