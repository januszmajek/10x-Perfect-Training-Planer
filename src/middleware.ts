import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/history", "/account", "/api/account", "/workouts", "/api/workouts"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isWorkoutApiPath(pathname: string): boolean {
  return pathname === "/api/workouts" || pathname.startsWith("/api/workouts/");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.supabase = supabase;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (isProtectedPath(context.url.pathname)) {
    if (!context.locals.user && !isWorkoutApiPath(context.url.pathname)) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
