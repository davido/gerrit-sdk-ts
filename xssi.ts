import type { Middleware, ResponseContext } from './src/runtime';

const GUARD = ")]}'\n";

/**
 * A typescript-fetch {@link Middleware} that strips Gerrit's `)]}'` XSSI guard from JSON
 * response bodies before the generated client parses them.
 *
 * Every Gerrit JSON body starts with `)]}'` on its own line, to defeat cross-site script
 * inclusion. That prefix is not valid JSON and is not expressible in OpenAPI. Unlike the
 * Rust SDK (whose blocking reqwest has no hook), typescript-fetch exposes a `post()`
 * middleware -- so this strips the guard with no edit to generated code. Register it via
 * `new Configuration({ middleware: [gerritXssiMiddleware] })`.
 */
export const gerritXssiMiddleware: Middleware = {
  async post(context: ResponseContext): Promise<Response | void> {
    const contentType = context.response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      return; // leave text/plain and binary responses untouched
    }
    const text = await context.response.text();
    const body = text.startsWith(GUARD) ? text.slice(GUARD.length) : text;
    return new Response(body, {
      status: context.response.status,
      statusText: context.response.statusText,
      headers: context.response.headers,
    });
  },
};

/** Strip the leading `)]}'` guard from a string (exposed for unit testing). */
export function strip(body: string): string {
  return body.startsWith(GUARD) ? body.slice(GUARD.length) : body;
}
