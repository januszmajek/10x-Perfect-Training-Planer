import type { APIRoute } from "astro";
import { hasConfirmedAiProviderKeyRemoval, hasSameOrigin } from "@/lib/ai-provider-key-request";
import { removeAiProviderKey } from "@/lib/ai-provider-keys";
import { setToastStatus, type ToastStatus } from "@/lib/toast-notifications";

const ACCOUNT_PATH = "/account";

function redirectToAccount(context: Parameters<APIRoute>[0], status: ToastStatus): Response {
  setToastStatus(context.cookies, status, context.url.protocol === "https:");
  return context.redirect(ACCOUNT_PATH, 303);
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user || !context.locals.supabase) {
    return context.redirect("/auth/signin", 303);
  }

  if (!hasSameOrigin(context.request, context.url.origin)) {
    return redirectToAccount(context, "invalid");
  }

  try {
    const form = await context.request.formData();

    if (!hasConfirmedAiProviderKeyRemoval(form.entries())) {
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
