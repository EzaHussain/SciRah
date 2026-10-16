import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Guards server-side fetches of user-supplied URLs (the in-app reader) against SSRF:
 * only http(s) on standard ports, and never hosts that resolve to private, loopback,
 * link-local or otherwise internal addresses.
 */
export async function assertPublicUrl(raw: unknown): Promise<URL> {
  if (typeof raw !== 'string' || raw.length > 2000) throw new BadRequestException('A valid link is required');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BadRequestException('A valid link is required');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BadRequestException('Only web links can be opened');
  if (u.username || u.password) throw new BadRequestException('Links with credentials are not allowed');
  if (u.port && u.port !== '80' && u.port !== '443') throw new BadRequestException('This link cannot be opened in SciRah');

  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local'))
    throw new BadRequestException('This link cannot be opened in SciRah');

  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new BadRequestException('That website could not be found');
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new BadRequestException('This link cannot be opened in SciRah');
  return u;
}

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * fetch() that follows redirects manually, re-checking every hop with assertPublicUrl
 * (a public URL could otherwise redirect to an internal one).
 */
export async function safeFetch(start: URL, init: RequestInit & { timeoutMs?: number } = {}, maxHops = 6): Promise<{ res: Response; url: URL }> {
  const { timeoutMs = 15_000, ...rest } = init;
  let url = start;
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetch(url, { ...rest, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel().catch(() => undefined);
      url = await assertPublicUrl(new URL(loc, url).toString());
      continue;
    }
    return { res, url };
  }
  throw new BadRequestException('Too many redirects');
}
