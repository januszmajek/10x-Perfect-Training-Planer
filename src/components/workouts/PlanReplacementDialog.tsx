import { useEffect, useRef } from "react";
import type { CurrentPlannedWorkout } from "@/lib/planned-workouts";

interface Props {
  plan: CurrentPlannedWorkout | null;
  open: boolean;
  pending: boolean;
  draftValid: boolean;
  onCancel: () => void;
  onConfirm: (plan: CurrentPlannedWorkout) => void;
}

export default function PlanReplacementDialog({ plan, open, pending, draftValid, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!plan) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="replacement-title"
      aria-describedby="replacement-description"
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onCancel();
      }}
      onClose={onCancel}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-amber-300/30 bg-slate-950 p-5 text-white shadow-2xl backdrop:bg-slate-950/80 sm:p-6"
    >
      <p className="text-sm font-medium tracking-wide text-amber-200 uppercase">Replacement confirmation</p>
      <h2 id="replacement-title" className="mt-2 text-xl font-bold">
        Replace the current planned workout?
      </h2>
      <p id="replacement-description" className="mt-2 text-sm leading-6 text-blue-100/70">
        This draft is still local. It will replace this plan only if its current revision still matches the one shown
        here.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="button"
          disabled={pending || !draftValid}
          onClick={() => {
            onConfirm(plan);
          }}
          className="min-h-11 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-45"
        >
          {pending ? "Replacing…" : "Replace planned workout"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-blue-50 disabled:opacity-45"
        >
          Keep editing
        </button>
      </div>
    </dialog>
  );
}
