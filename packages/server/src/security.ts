import { Context, Next } from 'hono';

export async function securityMiddleware(
  c: Context,
  next: Next
): Promise<Response | void> {
  const host = c.req.header('host') || '';
  const isLocalHost =
    host.startsWith('127.0.0.1') ||
    host.startsWith('localhost') ||
    host.startsWith('[::1]');

  if (!isLocalHost) {
    return c.text('Forbidden: invalid Host header (DNS rebinding protection)', 403);
  }

  const origin = c.req.header('origin');
  if (origin) {
    const isLocalOrigin =
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://[::1]');

    if (!isLocalOrigin) {
      return c.text('Forbidden: cross-origin requests from non-local origins rejected', 403);
    }
  }

  await next();
}
