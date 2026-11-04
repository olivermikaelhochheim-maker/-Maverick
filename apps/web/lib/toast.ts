"use client";

export interface ToastInput {
  text: string;
  kind?: "ok" | "error";
  link?: { label: string; href: string };
}

/** Show a short confirmation anywhere in the app. */
export function toast(t: ToastInput | string) {
  window.dispatchEvent(new CustomEvent<ToastInput>("mvk:toast", { detail: typeof t === "string" ? { text: t } : t }));
}
