"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { FormMessage } from "@/features/auth/components/form-message";
import {
  type MembershipActionState,
  submitJoinRequestAction,
} from "@/features/membership/actions";

export function JoinRequestForm({ publicId }: { publicId: string }) {
  const router = useRouter();
  const initialState: MembershipActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(
    submitJoinRequestAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="publicId" value={publicId} />
      {state.message ? (
        <FormMessage kind={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormMessage>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "פותחים בקשה..." : "פתיחת בקשת הצטרפות"}
      </button>
    </form>
  );
}
