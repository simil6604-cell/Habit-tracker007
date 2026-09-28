import { auth } from "@/lib/auth/auth";
import { getLibrary } from "@/lib/library/library-data";
import { filterLibrary, parseSort, parseType, parseView } from "@/lib/library/library";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { LibraryItems } from "@/components/library/library-items";
import { LibraryFolders } from "@/components/library/library-folders";

export const metadata = { title: "My Library" };

/**
 * Everything this account has made, in one place.
 *
 * The material was scattered across the pages that happened to create it —
 * flashcards under School, photographed notes inside a topic, recordings
 * somewhere else again. Each of those is a good place to MAKE one and a bad
 * place to FIND one, because finding something means not remembering where
 * you put it.
 *
 * Nothing is copied here: each card links back to the page that owns the
 * thing. This is an index, not a second home.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user.id;

  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const query = (first("q") ?? "").slice(0, 100);
  const type = parseType(first("type"));
  const sort = parseSort(first("sort"));
  const view = parseView(first("view"));
  const rawFolder = first("folder");

  const { items, folders } = await getLibrary(userId);

  // A folder id from the URL is only honoured if it is really this account's.
  // Otherwise the page would show "0 results" for a stranger's folder id and
  // look like the library had been emptied.
  const folderId =
    rawFolder === "UNFILED"
      ? "UNFILED"
      : rawFolder && folders.some((folder) => folder.id === rawFolder)
        ? rawFolder
        : null;

  const result = filterLibrary(items, { query, type, sort, folderId });
  const unfiledCount = items.filter((item) => item.folderId === null).length;
  const activeFolderName = folders.find((folder) => folder.id === folderId)?.name;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Library</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Your study space.</h1>
          <p className="mt-1 text-muted">Organise. Revisit. Grow.</p>
        </div>
      </header>

      <LibraryToolbar counts={result.counts} type={type} sort={sort} view={view} query={query} />

      <LibraryFolders folders={folders} activeFolderId={folderId} unfiledCount={unfiledCount} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">
            {folderId === "UNFILED" ? "Not in a folder" : (activeFolderName ?? "Everything you have made")}
          </h2>
          <p className="text-sm text-muted" data-testid="library-result-count">
            {result.items.length === result.total
              ? `${result.total} ${result.total === 1 ? "item" : "items"}`
              : `${result.items.length} of ${result.total}`}
          </p>
        </div>

        {query && result.items.length === 0 && result.total > 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm font-medium">Nothing matches &ldquo;{query}&rdquo;</p>
            <p className="mt-1 text-sm text-muted">
              The search looks at titles, answers and the subject a thing belongs to.
            </p>
          </div>
        ) : (
          <LibraryItems items={result.items} folders={folders} view={view} />
        )}
      </section>
    </div>
  );
}
