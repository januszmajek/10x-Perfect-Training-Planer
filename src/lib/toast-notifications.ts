import type { APIContext } from "astro";

const TOAST_COOKIE_NAME = "ptp-toast-status";
const TOAST_COOKIE_MAX_AGE_SECONDS = 60;

export type ToastKind = "error" | "info" | "success" | "warning";

export interface ToastNotification {
  kind: ToastKind;
  title: string;
  message: string;
}

export const TOAST_NOTIFICATIONS = {
  "account-created": {
    kind: "success",
    title: "Account created",
    message: "Your account was created successfully.",
  },
  "workout-saved": {
    kind: "success",
    title: "Workout saved",
    message: "Your manual workout was saved successfully.",
  },
  "ai-workout-saved": {
    kind: "success",
    title: "AI workout saved",
    message: "Your AI-generated workout was saved successfully.",
  },
  "workout-updated": {
    kind: "success",
    title: "Workout updated",
    message: "Your planned workout was updated successfully.",
  },
  "workout-deleted": {
    kind: "success",
    title: "Workout deleted",
    message: "Your planned workout was deleted.",
  },
  "workout-completed": {
    kind: "success",
    title: "Workout completed",
    message: "Your workout was marked done and moved to completed history.",
  },
  "workout-changed": {
    kind: "warning",
    title: "Workout changed",
    message: "Your planned workout changed elsewhere.",
  },
  saved: {
    kind: "success",
    title: "API key saved",
    message: "Your OpenRouter key was saved.",
  },
  removed: {
    kind: "success",
    title: "API key removed",
    message: "Your OpenRouter key was removed.",
  },
  invalid: {
    kind: "error",
    title: "Invalid API key",
    message: "Enter an API key and try again.",
  },
  rejected: {
    kind: "error",
    title: "API key rejected",
    message: "The key could not be verified. Check it and try again.",
  },
  retry: {
    kind: "error",
    title: "Verification unavailable",
    message: "Key verification is temporarily unavailable. Your existing key was not changed.",
  },
  unavailable: {
    kind: "error",
    title: "Encryption unavailable",
    message: "Key encryption is unavailable. Your existing key was not changed.",
  },
  error: {
    kind: "error",
    title: "Account update failed",
    message: "The account update could not be completed. Please try again.",
  },
} as const satisfies Record<string, ToastNotification>;

export type ToastStatus = keyof typeof TOAST_NOTIFICATIONS;

type CookieStore = Pick<APIContext["cookies"], "delete" | "get" | "set">;

export function isToastStatus(value: string | undefined): value is ToastStatus {
  return value !== undefined && value in TOAST_NOTIFICATIONS;
}

export function getToastNotification(status: ToastStatus | null): ToastNotification | null {
  return status ? TOAST_NOTIFICATIONS[status] : null;
}

export function setToastStatus(cookies: CookieStore, status: ToastStatus, secure: boolean): void {
  cookies.set(TOAST_COOKIE_NAME, status, {
    httpOnly: false,
    maxAge: TOAST_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure,
  });
}

export function consumeToastStatus(cookies: CookieStore): ToastStatus | null {
  const value = cookies.get(TOAST_COOKIE_NAME)?.value;
  cookies.delete(TOAST_COOKIE_NAME, { path: "/" });
  return isToastStatus(value) ? value : null;
}

export function setClientToastStatus(status: ToastStatus): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOAST_COOKIE_NAME}=${encodeURIComponent(status)}; Path=/; Max-Age=${TOAST_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
