import { Suspense } from "react";
import InviteClient from "./InviteClient";

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md p-6">
          <h1 className="text-xl font-semibold">A abrir convite…</h1>
          <p className="mt-2 text-sm text-slate-600">Só um segundo.</p>
        </main>
      }
    >
      <InviteClient />
    </Suspense>
  );
}
