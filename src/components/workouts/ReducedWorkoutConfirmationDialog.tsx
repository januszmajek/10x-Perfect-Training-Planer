import { useEffect, useRef } from "react";

interface Props {
  confirmation: { count: 3 | 4; token: string } | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (token: string) => void;
}

export default function ReducedWorkoutConfirmationDialog({ confirmation, pending, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) dialog.showModal();
    if (!confirmation && dialog.open) dialog.close();
  }, [confirmation]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="reduced-confirmation-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[30rem] rounded-2xl border border-white/15 bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-black/70"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <div className="space-y-4 p-6">
        <h2 id="reduced-confirmation-title" className="text-lg font-semibold">
          Generate a smaller workout?
        </h2>
        <p className="text-sm leading-6 text-blue-100/75">
          Only {confirmation?.count ?? 0} recovery-compatible exercises are available right now. You can keep planning
          manually, or generate a workout with exactly that many exercises.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold disabled:opacity-45"
          >
            Keep planning manually
          </button>
          <button
            type="button"
            disabled={pending || !confirmation}
            onClick={() => {
              if (confirmation) onConfirm(confirmation.token);
            }}
            className="min-h-11 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold disabled:opacity-45"
          >
            {pending ? "Generating…" : "Generate smaller workout"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
