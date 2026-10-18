import { useLocation } from "react-router-dom";

function safeNext(value: string | null | undefined) {
  if (!value) return "";
  if (!value.startsWith("/") || value.startsWith("//")) return "";
  return value;
}

export function loginPath(next?: string, kind: "site" | "admin" = "site") {
  const base = kind === "admin" ? "/admin/login" : "/login";
  const dest = safeNext(next);
  return dest ? `${base}?next=${encodeURIComponent(dest)}` : base;
}

export function registerPath(next?: string) {
  const dest = safeNext(next);
  return dest ? `/register?next=${encodeURIComponent(dest)}` : "/register";
}

export function useReturnTo() {
  const { pathname, search } = useLocation();
  return `${pathname}${search}`;
}

export function useLoginPath(kind: "site" | "admin" = "site") {
  return loginPath(useReturnTo(), kind);
}

export function useRegisterPath() {
  return registerPath(useReturnTo());
}
