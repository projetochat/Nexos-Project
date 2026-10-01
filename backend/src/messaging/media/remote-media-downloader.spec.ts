import { describe, expect, it, vi } from "vitest";
import { downloadRemoteMedia, type RemoteMediaDependencies } from "./remote-media-downloader";

function response(input: {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  chunks?: Uint8Array[];
}) {
  const dispose = vi.fn();
  return {
    statusCode: input.statusCode ?? 200,
    headers: input.headers ?? {},
    body: (async function* () {
      for (const chunk of input.chunks ?? []) yield chunk;
    })(),
    dispose,
  };
}

function dependencies(
  addresses: Array<{ address: string; family: number }>,
  responses: ReturnType<typeof response>[],
) {
  const request = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  });
  const lookup = vi.fn().mockResolvedValue(addresses);
  return { lookup, request } satisfies RemoteMediaDependencies;
}

describe("remote media downloader", () => {
  it.each([
    "http://127.0.0.1/media",
    "http://169.254.169.254/latest/meta-data",
    "http://10.1.2.3/media",
    "http://172.16.2.3/media",
    "http://192.168.1.2/media",
    "http://2130706433/media",
    "http://0x7f000001/media",
    "http://0177.0.0.1/media",
    "http://[::1]/media",
    "http://[fe80::1]/media",
    "http://[fc00::1]/media",
    "http://[::ffff:127.0.0.1]/media",
  ])("blocks private or metadata literal %s before opening a connection", async (url) => {
    const deps = dependencies([], []);
    await expect(downloadRemoteMedia(url, { maxBytes: 100 }, deps)).rejects.toThrow(
      "MEDIA_REMOTE_ADDRESS_BLOCKED",
    );
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("blocks a hostname resolving to private or mixed public/private addresses", async () => {
    for (const addresses of [
      [{ address: "127.0.0.1", family: 4 }],
      [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    ]) {
      const deps = dependencies(addresses, []);
      await expect(
        downloadRemoteMedia("https://cdn.example.test/media", { maxBytes: 100 }, deps),
      ).rejects.toThrow("MEDIA_REMOTE_ADDRESS_BLOCKED");
      expect(deps.request).not.toHaveBeenCalled();
    }
  });

  it("pins a validated public DNS result into the transport request", async () => {
    const deps = dependencies(
      [{ address: "93.184.216.34", family: 4 }],
      [response({ headers: { "content-length": "3" }, chunks: [Buffer.from("abc")] })],
    );
    await expect(
      downloadRemoteMedia("https://cdn.example.test/media", { maxBytes: 3 }, deps),
    ).resolves.toEqual(Buffer.from("abc"));
    expect(deps.request).toHaveBeenCalledWith(
      expect.objectContaining({ address: "93.184.216.34", family: 4 }),
    );
  });

  it("revalidates every redirect and blocks a public-to-private redirect before its connection", async () => {
    const redirect = response({
      statusCode: 302,
      headers: { location: "http://127.0.0.1/secret" },
    });
    const deps = dependencies([{ address: "93.184.216.34", family: 4 }], [redirect]);
    await expect(
      downloadRemoteMedia("https://cdn.example.test/media", { maxBytes: 100 }, deps),
    ).rejects.toThrow("MEDIA_REMOTE_ADDRESS_BLOCKED");
    expect(deps.request).toHaveBeenCalledOnce();
    expect(redirect.dispose).toHaveBeenCalledOnce();
  });

  it("does not let a public URL redirect into an allowlisted private provider", async () => {
    const redirect = response({
      statusCode: 302,
      headers: { location: "http://evolution-api:8080/internal" },
    });
    const request = vi.fn().mockResolvedValue(redirect);
    const lookup = vi.fn(async (hostname: string) =>
      hostname === "cdn.example.test"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "10.0.0.8", family: 4 }],
    );
    await expect(
      downloadRemoteMedia(
        "https://cdn.example.test/media",
        { maxBytes: 100, allowedPrivateOrigins: ["http://evolution-api:8080"] },
        { lookup, request },
      ),
    ).rejects.toThrow("MEDIA_REMOTE_ADDRESS_BLOCKED");
    expect(request).toHaveBeenCalledOnce();
    expect(redirect.dispose).toHaveBeenCalledOnce();
  });

  it("limits redirect chains and disposes every intermediate response", async () => {
    const first = response({ statusCode: 302, headers: { location: "/second" } });
    const second = response({ statusCode: 302, headers: { location: "/third" } });
    const deps = dependencies([{ address: "93.184.216.34", family: 4 }], [first, second]);
    await expect(
      downloadRemoteMedia(
        "https://cdn.example.test/first",
        { maxBytes: 100, maxRedirects: 1 },
        deps,
      ),
    ).rejects.toThrow("MEDIA_REMOTE_REDIRECT_LIMIT");
    expect(deps.request).toHaveBeenCalledTimes(2);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it("applies one overall deadline even when DNS resolution stalls", async () => {
    const deps: RemoteMediaDependencies = {
      lookup: vi.fn(() => new Promise(() => undefined)),
      request: vi.fn(),
    };
    await expect(
      downloadRemoteMedia(
        "https://cdn.example.test/media",
        { maxBytes: 100, timeoutMs: 100 },
        deps,
      ),
    ).rejects.toThrow("MEDIA_REMOTE_TIMEOUT");
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("applies the overall deadline while the response body stalls between chunks", async () => {
    const dispose = vi.fn();
    const deps: RemoteMediaDependencies = {
      lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      request: vi.fn().mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: (async function* () {
          yield Buffer.from("a");
          await new Promise(() => undefined);
        })(),
        dispose,
      }),
    };
    await expect(
      downloadRemoteMedia(
        "https://cdn.example.test/media",
        { maxBytes: 100, timeoutMs: 100 },
        deps,
      ),
    ).rejects.toThrow("MEDIA_REMOTE_TIMEOUT");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("allows an exact configured private provider origin while still pinning DNS", async () => {
    const deps = dependencies(
      [{ address: "10.0.0.8", family: 4 }],
      [response({ chunks: [Buffer.from("ok")] })],
    );
    await expect(
      downloadRemoteMedia(
        "http://evolution-api:8080/media/id",
        { maxBytes: 10, allowedPrivateOrigins: ["http://evolution-api:8080"] },
        deps,
      ),
    ).resolves.toEqual(Buffer.from("ok"));
  });

  it("rejects credentials, unsafe protocols and invalid redirect locations", async () => {
    const deps = dependencies([{ address: "93.184.216.34", family: 4 }], []);
    await expect(downloadRemoteMedia("file:///etc/passwd", { maxBytes: 10 }, deps)).rejects.toThrow(
      "MEDIA_REMOTE_URL_INVALID",
    );
    await expect(
      downloadRemoteMedia("https://user:pass@cdn.example.test/x", { maxBytes: 10 }, deps),
    ).rejects.toThrow("MEDIA_REMOTE_URL_INVALID");
  });

  it("rejects an oversized or malformed content-length before reading the stream", async () => {
    for (const contentLength of ["101", "invalid", "-1"]) {
      const remote = response({ headers: { "content-length": contentLength } });
      const deps = dependencies([{ address: "93.184.216.34", family: 4 }], [remote]);
      await expect(
        downloadRemoteMedia("https://cdn.example.test/x", { maxBytes: 100 }, deps),
      ).rejects.toThrow(/MEDIA_REMOTE_(TOO_LARGE|CONTENT_LENGTH_INVALID)/);
      expect(remote.dispose).toHaveBeenCalledOnce();
    }
  });

  it("enforces the streaming limit when content-length is absent or false", async () => {
    for (const headers of [{}, { "content-length": "1" }]) {
      const remote = response({ headers, chunks: [Buffer.alloc(60), Buffer.alloc(41)] });
      const deps = dependencies([{ address: "93.184.216.34", family: 4 }], [remote]);
      await expect(
        downloadRemoteMedia("https://cdn.example.test/x", { maxBytes: 100 }, deps),
      ).rejects.toThrow("MEDIA_REMOTE_TOO_LARGE");
      expect(remote.dispose).toHaveBeenCalledOnce();
    }
  });
});
