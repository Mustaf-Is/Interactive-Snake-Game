const WINDOW_MS = 60_000;
export const WRITE_LIMITS = { start: 12, submit: 30, account: 10, register: 3, loginName: 5 } as const;

// D1 serializes the conditional UPSERT, so concurrent Worker instances share
// the same budget. Only Cloudflare's trusted edge header identifies a client;
// requests without it share a conservative fallback budget.
export async function limitWrite(db: D1Database, req: Request, action: keyof typeof WRITE_LIMITS, now = Date.now(), subject?: string) {
  const window = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const address = subject ?? req.headers.get('CF-Connecting-IP') ?? 'unknown';
  // Rotate the digest each window. Never persist a raw address.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${window}:${address}`));
  const key = `${action}:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
  const results = await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(window),
    db.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET count = count + 1
      WHERE count < ? RETURNING count`).bind(key, window, WRITE_LIMITS[action]),
  ]);
  if (results[1].results.length) return null;
  return Response.json({error: 'Too many requests. Please wait a moment and retry.'}, {
    status: 429,
    headers: {'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, Math.ceil((window + WINDOW_MS - now) / 1000)))},
  });
}
