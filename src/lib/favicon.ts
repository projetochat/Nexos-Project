// Keep the application and the standalone error page on the same environment favicon.
const FAVICON_HREFS = {
  development: "/favicon-dev.ico?v=trixus-20261023-global-v1",
  homologation: "/favicon-hom.ico?v=trixus-20261023-global-v1",
  production: "/favicon-prod.ico?v=trixus-20261023-global-v1",
} as const;

export type FaviconEnvironment = keyof typeof FAVICON_HREFS;

type FaviconRuntime = {
  appMode?: string;
  viteMode?: string;
  isDev?: boolean;
};

function normalizeMode(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

export function resolveFaviconEnvironment({
  appMode,
  viteMode,
  isDev = false,
}: FaviconRuntime): FaviconEnvironment {
  const normalizedViteMode = normalizeMode(viteMode);
  if (isDev || ["development", "dev", "local"].includes(normalizedViteMode)) {
    return "development";
  }

  const normalizedAppMode = normalizeMode(appMode);
  if (["development", "dev", "local"].includes(normalizedAppMode)) return "development";
  if (["homologation", "hom", "staging"].includes(normalizedAppMode)) return "homologation";
  if (["production", "prod"].includes(normalizedAppMode)) return "production";

  if (["homologation", "hom", "staging"].includes(normalizedViteMode)) return "homologation";
  if (["production", "prod"].includes(normalizedViteMode)) return "production";

  // Unknown non-development builds must never look like DEV or HOM by accident.
  return "production";
}

export function resolveFaviconHref(runtime: FaviconRuntime): string {
  return FAVICON_HREFS[resolveFaviconEnvironment(runtime)];
}

export const FAVICON_HREF = resolveFaviconHref({
  appMode: import.meta.env.VITE_APP_MODE,
  viteMode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
});
