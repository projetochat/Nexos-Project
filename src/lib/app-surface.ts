export type AppSurface = "platform" | "tenant" | "unified" | "unknown";

const DEFAULT_PLATFORM_APP_URL = "https://app.trixus.com.br";
const DEFAULT_TENANT_APP_URL = "https://chat.trixus.com.br";

function configuredOrigin(value: string | undefined, fallback: string) {
  try {
    const url = new URL(value || fallback);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : new URL(fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

export function platformAppOrigin() {
  return configuredOrigin(import.meta.env.VITE_TRIXUS_PLATFORM_APP_URL, DEFAULT_PLATFORM_APP_URL);
}

export function tenantAppOrigin() {
  return configuredOrigin(import.meta.env.VITE_TRIXUS_TENANT_APP_URL, DEFAULT_TENANT_APP_URL);
}

function hostnameFromOrigin(origin: string) {
  return new URL(origin).hostname.toLowerCase();
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

export function appSurfaceForHostname(hostname: string): AppSurface {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isLocalHostname(normalized)) return "unified";
  if (normalized === hostnameFromOrigin(platformAppOrigin())) return "platform";
  if (normalized === hostnameFromOrigin(tenantAppOrigin())) return "tenant";
  return import.meta.env.VITE_APP_MODE === "production" ? "unknown" : "unified";
}

export function currentAppSurface(): AppSurface {
  if (typeof window === "undefined") return "unified";
  return appSurfaceForHostname(window.location.hostname);
}

export function appTitleForHostname(_hostname: string) {
  return "Trixus | App";
}

export function appTitleWithUnreadConversations(unreadConversations: number) {
  const count = Math.max(0, Math.floor(unreadConversations));
  return count > 0 ? `(${count}) Trixus | App` : "Trixus | App";
}

export function loginEndpointForSurface(surface = currentAppSurface()) {
  if (surface === "platform") return "/auth/platform/login";
  if (surface === "tenant") return "/auth/tenant/login";
  if (surface === "unknown") return "/auth/tenant/login";
  return "/auth/login";
}

function safePathname(pathname: string) {
  return pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/login";
}

/**
 * Returns an absolute, allowlisted destination when the current hostname cannot
 * serve the requested route. Query strings and fragments are intentionally not
 * copied across origins, so credentials and one-time codes never hitch a ride.
 */
export function surfaceRedirect(input: { hostname: string; pathname: string }): string | null {
  const surface = appSurfaceForHostname(input.hostname);
  const pathname = safePathname(input.pathname);

  if (surface === "unknown") return `${tenantAppOrigin()}/login`;
  if (surface === "unified" || pathname === "/login") return null;
  if (surface === "platform") {
    if (pathname === "/") return `${platformAppOrigin()}/admin`;
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
    return `${tenantAppOrigin()}${pathname}`;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return `${platformAppOrigin()}${pathname}`;
  }
  return null;
}
