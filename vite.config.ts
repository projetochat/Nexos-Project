// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
// Vite 8 provides native tsconfig path resolution, so the wrapper's legacy paths plugin is removed
// from the resolved plugin list below to avoid duplicate path processing during Windows cold starts.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import {
  createRunnableDevEnvironment,
  createServerModuleRunner,
  type ConfigEnv,
  type PluginOption,
  type UserConfig,
} from "vite";

const createTrixusConfig = defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    environments: {
      ssr: {
        dev: {
          createEnvironment(name, resolvedConfig) {
            return createRunnableDevEnvironment(name, resolvedConfig, {
              runner(environment, options) {
                const runner = createServerModuleRunner(environment, options);
                // The initial route graph can legitimately take over Vite's 60s default on Windows.
                runner.options.transport.timeout = 300_000;
                return runner;
              },
            });
          },
        },
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      // On Windows, waiting for the full route crawl can exceed Vite's 60s SSR RPC timeout.
      noDiscovery: true,
      holdUntilCrawlEnd: false,
      include: [
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-popover",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-select",
        "@radix-ui/react-switch",
        "@radix-ui/react-tooltip",
        "@tanstack/react-query",
        "class-variance-authority",
        "clsx",
        "dompurify",
        "libphonenumber-js",
        "libphonenumber-js/min",
        "lucide-react",
        "recharts",
        "socket.io-client",
        "sonner",
        "tailwind-merge",
        "xlsx",
        "zustand",
        "zustand/middleware",
      ],
    },
  },
});

export default async function config(env: ConfigEnv): Promise<UserConfig> {
  const resolved = await createTrixusConfig(env);
  resolved.plugins = resolved.plugins?.filter(
    (plugin) => !isNamedPlugin(plugin, "vite-tsconfig-paths"),
  );
  return resolved;
}

function isNamedPlugin(plugin: PluginOption, name: string): boolean {
  return Boolean(
    plugin &&
    !Array.isArray(plugin) &&
    typeof plugin === "object" &&
    "name" in plugin &&
    plugin.name === name,
  );
}
