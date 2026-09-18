"use client";

import { useTransition } from "react";
import { deleteAccount } from "@/lib/settings/actions";
import { Button } from "@/components/ui/button";

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("This permanently deletes your account and all data. Are you sure?")) {
          startTransition(() => deleteAccount());
        }
      }}
    >
      Delete my account
    </Button>
  );
}
