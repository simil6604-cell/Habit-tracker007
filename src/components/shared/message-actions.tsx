"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

/**
 * Edit and delete, on one message in a chat.
 *
 * Shared by the school AI and the AI Coach so the two behave the same way:
 * a chat where the same gesture does different things in different places
 * is worse than one where it is missing.
 *
 * Delete asks twice. Not a dialog — a dialog for one line of a chat is
 * heavy — but the bin turns into the word "Delete?" and only the second tap
 * does it. These controls sit under a message on a phone, where a thumb
 * lands near them by accident, and there is no undo behind this.
 */
export function MessageActions({
  onEdit,
  onDelete,
  disabled,
  idSuffix,
}: {
  /** Left out for a reply: an edited answer would be words put in its mouth. */
  onEdit?: () => void;
  onDelete: () => void;
  disabled?: boolean;
  /** So two messages' buttons can be told apart in a test. */
  idSuffix: string;
}) {
  const [armed, setArmed] = useState(false);

  // Disarms itself. A confirmation left sitting there is one an unrelated
  // tap minutes later lands on.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5_000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <>
      {onEdit && (
        <button
          type="button"
          data-testid={`edit-message-${idSuffix}`}
          aria-label="Edit this message and ask again"
          title="Edit and ask again"
          disabled={disabled}
          onClick={onEdit}
          className="opacity-60 transition hover:text-accent hover:opacity-100 disabled:opacity-30"
        >
          <Pencil size={11} />
        </button>
      )}
      {armed ? (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid={`confirm-delete-${idSuffix}`}
            disabled={disabled}
            onClick={() => {
              setArmed(false);
              onDelete();
            }}
            className="font-medium text-danger underline underline-offset-2 disabled:opacity-30"
          >
            Delete?
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="text-muted underline underline-offset-2"
          >
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          data-testid={`delete-message-${idSuffix}`}
          aria-label="Delete this message"
          title="Delete"
          disabled={disabled}
          onClick={() => setArmed(true)}
          className="opacity-60 transition hover:text-danger hover:opacity-100 disabled:opacity-30"
        >
          <Trash2 size={11} />
        </button>
      )}
    </>
  );
}
