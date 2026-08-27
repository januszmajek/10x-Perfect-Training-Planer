import type { APIRoute } from "astro";
import { saveAiProviderKey } from "@/lib/ai-provider-keys";

const ACCOUNT_PATH = "/account";

function redirectToAccount(context: Parameters<APIRoute>[0], status: string): Response {
  return context.redirect(`${ACCOUNT_PATH}?status=${status}`, 303);
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user || !context.locals.supabase) {
    return context.redirect("/auth/signin", 303);
  }

  let apiKey: FormDataEntryValue;

  try {
    const form = await context.request.formData();
    const entries = [...form.entries()];

    if (entries.length !== 1 || entries[0]?.[0] !== "apiKey" || typeof entries[0][1] !== "string") {
      return redirectToAccount(context, "invalid");
    }

    apiKey = entries[0][1];
  } catch {
    return redirectToAccount(context, "invalid");
  }

  const result = await saveAiProviderKey(context.locals.supabase, context.locals.user.id, apiKey);

  if (result.ok) {
    return redirectToAccount(context, "saved");
  }

  if (result.reason === "invalid_input") {
    return redirectToAccount(context, "invalid");
  }

  if (result.reason === "unavailable_encryption") {
    return redirectToAccount(context, "unavailable");
  }

  if (result.reason === "unauthenticated") {
    return context.redirect("/auth/signin", 303);
  }

  return redirectToAccount(context, "error");
};
