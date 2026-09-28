export async function waitForMinimumDuration(startedAt: number, minimumMs: number) {
  const remaining = Math.max(0, minimumMs - (Date.now() - startedAt));
  if (remaining > 0)
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, remaining));
}
