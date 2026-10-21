import { describe, expect, it } from "vitest";
import { claimAutoReload, isStaleBuildError } from "@/lib/utils/stale-build";

describe("isStaleBuildError", () => {
  it("recognises the error a deploy leaves in an open tab", () => {
    // Taken verbatim from a real occurrence, where a rebuild replaced the
    // files while a tab was open and the next chunk request returned 400.
    const real = Object.assign(new Error("Loading chunk 7058 failed.\n(error: /_next/static/chunks/7058-86ac.js)"), {
      name: "ChunkLoadError",
    });
    expect(isStaleBuildError(real)).toBe(true);
  });

  it("recognises it by message alone, since the name is not always set", () => {
    expect(isStaleBuildError({ message: "Loading chunk 412 failed." })).toBe(true);
    expect(isStaleBuildError({ message: "Loading CSS chunk 9 failed." })).toBe(true);
    expect(isStaleBuildError({ message: "Failed to fetch dynamically imported module: /a.js" })).toBe(true);
    expect(isStaleBuildError({ message: "error loading dynamically imported module" })).toBe(true);
  });

  it("does not claim an ordinary bug is a stale deploy", () => {
    // The distinction matters: these must not be answered with "we updated the
    // app, reload" — that would send someone in circles past a real fault.
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isStaleBuildError({ message: "Failed to fetch" })).toBe(false);
    expect(isStaleBuildError({ message: "chunky soup" })).toBe(false);
    expect(isStaleBuildError({})).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });
});

describe("claimAutoReload", () => {
  function fakeStore(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  }

  it("allows the first reload and refuses every one after it", () => {
    const store = fakeStore();
    expect(claimAutoReload(store)).toBe(true);
    expect(claimAutoReload(store)).toBe(false);
    expect(claimAutoReload(store)).toBe(false);
  });

  it("refuses when there is no storage to remember with", () => {
    // Without a record of having reloaded, a reload repeats forever. Refusing
    // is the whole point: the person gets a button instead of a loop.
    expect(claimAutoReload(null)).toBe(false);
  });

  it("refuses when storage throws instead of answering", () => {
    const throwsOnRead = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(claimAutoReload(throwsOnRead)).toBe(false);

    const throwsOnWrite = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(claimAutoReload(throwsOnWrite)).toBe(false);
  });
});
