import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

type RemoteMediaResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  dispose(): void;
};

export type RemoteMediaDependencies = {
  lookup(hostname: string): Promise<Array<{ address: string; family: number }>>;
  request(input: {
    url: URL;
    address: string;
    family: number;
    timeoutMs: number;
  }): Promise<RemoteMediaResponse>;
};

export type RemoteMediaDownloadOptions = {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedPrivateOrigins?: string[];
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 3;

export async function downloadRemoteMedia(
  input: string,
  options: RemoteMediaDownloadOptions,
  dependencies: RemoteMediaDependencies = defaultDependencies,
) {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error("MEDIA_REMOTE_LIMIT_INVALID");
  }
  const timeoutMs = boundedInteger(options.timeoutMs, configuredTimeoutMs(), 100, 60_000);
  const maxRedirects = boundedInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS, 0, 5);
  const allowedPrivateOrigins = new Set(
    (options.allowedPrivateOrigins ?? configuredPrivateOrigins()).map(normalizeOrigin),
  );
  const deadline = Date.now() + timeoutMs;
  let current = parseRemoteUrl(input);
  const privateTrustChain = allowedPrivateOrigins.has(current.origin);

  for (let redirectCount = 0; ; redirectCount += 1) {
    // A public attacker-controlled URL must not gain access to an internal allowlisted
    // service through a redirect. Private trust is established only by the initial origin.
    const allowPrivate = privateTrustChain && allowedPrivateOrigins.has(current.origin);
    const addresses = await resolveAndValidate(current, allowPrivate, dependencies, deadline);
    const selected = addresses[0];
    const response = await withDeadline(
      dependencies.request({
        url: current,
        address: selected.address,
        family: selected.family,
        timeoutMs: remainingMs(deadline),
      }),
      deadline,
    );
    const status = response.statusCode;
    if (status >= 300 && status < 400) {
      try {
        if (redirectCount >= maxRedirects) throw new Error("MEDIA_REMOTE_REDIRECT_LIMIT");
        const location = singleHeader(response.headers.location);
        if (!location) throw new Error("MEDIA_REMOTE_REDIRECT_INVALID");
        current = parseRemoteUrl(new URL(location, current).toString());
      } finally {
        response.dispose();
      }
      continue;
    }
    if (status < 200 || status >= 300) {
      response.dispose();
      throw new Error(`MEDIA_REMOTE_HTTP_${status}`);
    }
    try {
      assertContentLength(response.headers["content-length"], options.maxBytes);
      let chunks: Buffer[] = [];
      let size = 0;
      const iterator = response.body[Symbol.asyncIterator]();
      for (;;) {
        const next = await withDeadline(Promise.resolve(iterator.next()), deadline);
        if (next.done) break;
        const chunk = next.value;
        const buffer = Buffer.from(chunk);
        size += buffer.byteLength;
        if (size > options.maxBytes) throw new Error("MEDIA_REMOTE_TOO_LARGE");
        if (buffer.byteLength > 0) chunks.push(buffer);
        // Bound per-chunk bookkeeping even if an upstream peer fragments the body aggressively.
        if (chunks.length >= 1_024) chunks = [Buffer.concat(chunks, size)];
      }
      if (size === 0) throw new Error("MEDIA_REMOTE_EMPTY");
      return Buffer.concat(chunks, size);
    } finally {
      response.dispose();
    }
  }
}

async function resolveAndValidate(
  url: URL,
  allowPrivate: boolean,
  dependencies: RemoteMediaDependencies,
  deadline: number,
) {
  const hostname = stripIpv6Brackets(url.hostname);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await withDeadline(dependencies.lookup(hostname), deadline);
  if (addresses.length === 0) throw new Error("MEDIA_REMOTE_DNS_EMPTY");
  if (!allowPrivate && addresses.some((item) => !isPublicAddress(item.address))) {
    throw new Error("MEDIA_REMOTE_ADDRESS_BLOCKED");
  }
  return addresses;
}

function parseRemoteUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("MEDIA_REMOTE_URL_INVALID");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname
  ) {
    throw new Error("MEDIA_REMOTE_URL_INVALID");
  }
  return url;
}

function normalizeOrigin(input: string) {
  const url = parseRemoteUrl(input.trim());
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("MEDIA_REMOTE_ORIGIN_INVALID");
  return url.origin;
}

function configuredPrivateOrigins() {
  const values = (process.env.TRIXUS_MEDIA_DOWNLOAD_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const evolutionBaseUrl = process.env.EVOLUTION_BASE_URL?.trim();
  if (evolutionBaseUrl) {
    try {
      values.push(new URL(evolutionBaseUrl).origin);
    } catch {
      // Production environment validation reports malformed provider configuration.
    }
  }
  return [...new Set(values)];
}

function configuredTimeoutMs() {
  const configured = Number(process.env.TRIXUS_MEDIA_DOWNLOAD_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isInteger(configured) && configured >= 100 && configured <= 60_000
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

function assertContentLength(value: string | string[] | undefined, maxBytes: number) {
  if (value === undefined) return;
  const serialized = singleHeader(value);
  if (!serialized || !/^\d+$/.test(serialized)) {
    throw new Error("MEDIA_REMOTE_CONTENT_LENGTH_INVALID");
  }
  const size = Number(serialized);
  if (!Number.isSafeInteger(size)) throw new Error("MEDIA_REMOTE_CONTENT_LENGTH_INVALID");
  if (size > maxBytes) throw new Error("MEDIA_REMOTE_TOO_LARGE");
}

function singleHeader(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : undefined;
}

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)
  ) {
    return false;
  }
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(address: string) {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  // Accept only global unicast (2000::/3), excluding documentation and transition ranges.
  if ((bytes[0] & 0xe0) !== 0x20) return false;
  if (matchesPrefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) return false;
  if (matchesPrefix(bytes, [0x20, 0x01, 0x00, 0x00], 32)) return false;
  if (matchesPrefix(bytes, [0x20, 0x02], 16)) return false;
  return true;
}

function ipv6Bytes(input: string) {
  const address = input.split("%", 1)[0].toLowerCase();
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => {
    if (!part) return [] as number[];
    const words: number[] = [];
    for (const token of part.split(":")) {
      if (token.includes(".")) {
        const octets = token.split(".").map(Number);
        if (octets.length !== 4 || octets.some((item) => item < 0 || item > 255)) return null;
        words.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
        words.push(Number.parseInt(token, 16));
      }
    }
    return words;
  };
  const left = parse(halves[0]);
  const right = parse(halves[1] ?? "");
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const words = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  if (words.length !== 8) return null;
  return Uint8Array.from(words.flatMap((word) => [word >> 8, word & 0xff]));
}

function matchesPrefix(address: Uint8Array, prefix: number[], bits: number) {
  const fullBytes = Math.floor(bits / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (address[index] !== prefix[index]) return false;
  }
  const remaining = bits % 8;
  if (!remaining) return true;
  const mask = 0xff << (8 - remaining);
  return (address[fullBytes] & mask) === (prefix[fullBytes] & mask);
}

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isInteger(value) ? Math.min(Math.max(value!, min), max) : fallback;
}

function remainingMs(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("MEDIA_REMOTE_TIMEOUT");
  return remaining;
}

function withDeadline<T>(promise: Promise<T>, deadline: number) {
  const timeoutMs = remainingMs(deadline);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MEDIA_REMOTE_TIMEOUT")), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const defaultDependencies: RemoteMediaDependencies = {
  lookup: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  request: ({ url, address, family, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
      const request = transport(
        url,
        {
          method: "GET",
          headers: { accept: "*/*", "accept-encoding": "identity" },
          lookup: (_hostname, _options, callback) => callback(null, address, family as 4 | 6),
        },
        (response) =>
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: response,
            dispose: () => response.destroy(),
          }),
      );
      request.setTimeout(timeoutMs, () => request.destroy(new Error("MEDIA_REMOTE_TIMEOUT")));
      request.once("error", reject);
      request.end();
    }),
};
