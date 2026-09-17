import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Decides whether a URL the user pasted may be fetched by the server.
 *
 * The server sits inside the deployment's network, so "fetch this link for me"
 * is an invitation to reach things the browser never could: the container's own
 * ports, a database on the private network, a cloud metadata endpoint. Neither
 * the scheme check nor the shape of the URL says anything about that — only the
 * address it resolves to does.
 *
 * So the hostname is resolved first and every answer has to be a public
 * address. One private answer rejects the URL, because a name can return
 * several and picking the reachable one is the attacker's job, not ours.
 *
 * What this does NOT stop: a name that passes here and resolves to something
 * private microseconds later, when fetch() looks it up again (DNS rebinding).
 * Closing that needs the connection pinned to the address that was checked,
 * which undici does not expose; the check below is the boundary that exists,
 * not a proof that none is left.
 */

export type UrlVerdict = { ok: true; url: URL } | { ok: false; error: string };

const ALLOWED_PORTS = new Set(["", "80", "443"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this network", and 0.0.0.0
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata at 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved, incl. 255.255.255.255
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const low = ip.toLowerCase().split("%")[0];
  if (low === "::1" || low === "::") return true;

  // ::ffff:1.2.3.4 and ::ffff:0102:0304 are IPv4 wearing an IPv6 shape.
  const mapped = low.match(/^::ffff:(.+)$/);
  if (mapped) {
    const tail = mapped[1];
    if (net.isIPv4(tail)) return isPrivateIPv4(tail);
    const hexPair = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexPair) {
      const n = (parseInt(hexPair[1], 16) << 16) | parseInt(hexPair[2], 16);
      return isPrivateIPv4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
    }
    return true;
  }

  if (low.startsWith("64:ff9b:")) return true; // NAT64, another way to name an IPv4 address
  const head = parseInt(low.split(":")[0] || "0", 16);
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // not an address we can classify — refuse rather than guess
}

/**
 * Validates one URL: http(s), a normal web port, a hostname that is not
 * already a private address, and no private answer in DNS.
 */
export async function verifyPublicUrl(raw: string): Promise<UrlVerdict> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http/https links are supported." };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, error: "Only standard web links (port 80 or 443) can be read." };
  }

  // new URL() keeps the brackets on an IPv6 literal.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, error: "That doesn't look like a valid URL." };

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      return { ok: false, error: "That link points inside a private network, so it can't be read from here." };
    }
    return { ok: true, url };
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, error: "That address couldn't be found." };
  }
  if (addresses.length === 0) return { ok: false, error: "That address couldn't be found." };
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    return { ok: false, error: "That link points inside a private network, so it can't be read from here." };
  }

  return { ok: true, url };
}

/**
 * Fetches a URL, re-checking every redirect against the same rule. Node's
 * fetch follows redirects itself, which would let a public host bounce the
 * request straight to 169.254.169.254 — so redirects are handled here instead.
 */
export async function fetchPublicUrl(
  raw: string,
  init: { headers?: Record<string, string>; timeoutMs?: number; maxRedirects?: number } = {}
): Promise<{ ok: true; response: Response; url: URL } | { ok: false; error: string }> {
  const maxRedirects = init.maxRedirects ?? 3;
  let target = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const verdict = await verifyPublicUrl(target);
    if (!verdict.ok) return verdict;

    let res: Response;
    try {
      res = await fetch(verdict.url.toString(), {
        headers: init.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(init.timeoutMs ?? 15000),
      });
    } catch (err) {
      return { ok: false, error: `Couldn't reach that page (${err instanceof Error ? err.message : "unknown error"}).` };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, error: "That link redirected somewhere this can't follow." };
      target = new URL(location, verdict.url).toString();
      continue;
    }

    return { ok: true, response: res, url: verdict.url };
  }

  return { ok: false, error: "That link redirected too many times." };
}
