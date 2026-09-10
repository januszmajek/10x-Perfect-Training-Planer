import React, { useState } from "react";
import { Check, KeyRound, LoaderCircle, Trash2, X } from "lucide-react";

const AI_PROVIDER_KEY_MAX_LENGTH = 512;

interface Props {
  configured: boolean;
  provider: "openrouter";
  updatedAt?: string;
  encryptionAvailable: boolean;
}

function formatUpdatedAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export default function AiKeyForm({ configured, provider, updatedAt, encryptionAvailable }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removePending, setRemovePending] = useState(false);
  const formattedUpdatedAt = formatUpdatedAt(updatedAt);

  function handleSave(event: React.SubmitEvent<HTMLFormElement>) {
    if (apiKey.length === 0 || apiKey.length > AI_PROVIDER_KEY_MAX_LENGTH) {
      event.preventDefault();
      setError("Enter an API key and try again.");
      return;
    }

    setError(null);
    setSavePending(true);
    window.setTimeout(() => {
      setApiKey("");
    }, 0);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">OpenRouter</h2>
          <p className="mt-1 text-sm text-blue-100/60">Provider: {provider}</p>
        </div>

        {configured ? (
          <div className="mt-1 flex items-start gap-3 sm:mt-0">
            <div className="text-right">
              <p className="text-sm font-semibold text-emerald-100">Configured</p>
              {formattedUpdatedAt && <p className="mt-1 text-xs text-blue-100/50">Updated {formattedUpdatedAt}</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                setConfirmingRemoval(true);
              }}
              aria-label="Remove saved OpenRouter key"
              title="Remove saved key"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-red-300/25 text-red-200 transition-colors hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : (
          <span className="mt-2 w-fit rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-blue-100/60 sm:mt-0">
            Not configured
          </span>
        )}
      </div>

      {!configured && (
        <form method="POST" action="/api/account/ai-key" className="mt-6 space-y-4" onSubmit={handleSave} noValidate>
          <div>
            <label htmlFor="apiKey" className="sr-only">
              OpenRouter API key
            </label>
            <div className="relative mt-3">
              <KeyRound
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/35"
              />
              <input
                id="apiKey"
                name="apiKey"
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  if (error) setError(null);
                }}
                readOnly={savePending || !encryptionAvailable}
                disabled={!encryptionAvailable}
                maxLength={AI_PROVIDER_KEY_MAX_LENGTH}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? "api-key-error" : undefined}
                className="w-full rounded-lg border border-white/15 bg-black/20 py-2.5 pr-3 pl-10 text-white placeholder:text-white/30 read-only:cursor-wait focus:border-purple-300 focus:ring-2 focus:ring-purple-400/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Enter your OpenRouter API key"
              />
            </div>
            {error && (
              <p id="api-key-error" role="alert" className="mt-2 text-sm text-red-200">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={savePending || !encryptionAvailable}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {savePending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-4" />
            )}
            <span aria-live="polite">{savePending ? "Saving…" : "Save key"}</span>
          </button>
        </form>
      )}

      {configured && confirmingRemoval && (
        <div className="mt-5 rounded-xl border border-red-300/20 bg-red-400/5 p-4">
          <p className="text-sm font-medium text-red-100">Remove the saved OpenRouter key?</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <form
              method="POST"
              action="/api/account/ai-key/remove"
              onSubmit={() => {
                setRemovePending(true);
              }}
            >
              <input type="hidden" name="confirm" value="true" />
              <button
                type="submit"
                disabled={removePending}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {removePending ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" className="size-4" />
                )}
                <span aria-live="polite">{removePending ? "Removing…" : "Confirm removal"}</span>
              </button>
            </form>
            <button
              type="button"
              disabled={removePending}
              onClick={() => {
                setConfirmingRemoval(false);
              }}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <X aria-hidden="true" className="size-4" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
