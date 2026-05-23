// Pure helpers for deciding whether the cors() middleware should echo a given Origin. Kept
// separate from app.ts so the allowlist logic can be unit-tested without spinning up an HTTP
// server — the HTTP-layer tests cover the wire contract (Vary, credentials, echo), these helpers
// cover the decision branches.

export function normalizeOrigin(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    return new URL(url.trim()).origin
  } catch {
    return null
  }
}

export function buildAllowedOrigins(urls: Array<string | undefined | null>): string[] {
  const out: string[] = []
  for (const url of urls) {
    const origin = normalizeOrigin(url)
    if (origin && !out.includes(origin)) out.push(origin)
  }
  return out
}

// Decide the `origin` value to pass to the `cors` package callback. `undefined` means "no Origin
// header on the request" — always allow, since non-browser clients (WeChat miniprogram native,
// server-to-server, curl) don't send Origin. In non-production any Origin is echoed back for
// local cross-host dev convenience; in production only the allowlist is echoed.
export function isOriginAllowed(origin: string | undefined, allowed: string[], strict: boolean): boolean {
  if (!origin) return true
  if (!strict) return true
  return allowed.includes(origin)
}
