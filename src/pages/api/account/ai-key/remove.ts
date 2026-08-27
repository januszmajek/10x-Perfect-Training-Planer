import type { APIRoute } from "astro";
import { removeAiProviderKey } from "@/lib/ai-provider-keys";

const ACCOUNT_PATH = "/account";

function redirectToAccount(context: Parameters<APIRoute>[0], status: string): Response {
  return context.redirect(`${ACCOUNT_PATH}?status=${status}`, 303);
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user || !context.locals.supabase) {
    return context.redirect("/auth/signin", 303);
  }

  try {
    const form = await context.request.formData();

    if (![...form.keys()].every((key) => key === "confirm")) {
      return redirectToAccount(context, "invalid");
    }
  } catch {
    return redirectToAccount(context, "invalid");
  }

  const result = await removeAiProviderKey(context.locals.supabase, context.locals.user.id);

  if (result.ok) {
    return redirectToAccount(context, "removed");
  }

  if (result.reason === "unauthenticated") {
    return context.redirect("/auth/signin", 303);
  }

  return redirectToAccount(context, "error");
};
