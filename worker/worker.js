// Cloudflare Worker proxy for the Claude Fantasy Analyst panel in
// Draft-Annihilator (dirtyk.github.io/Draft-Annihilator).
//
// Why this exists: GitHub Pages only serves static files, and the Anthropic
// API does not send CORS headers permitting browser requests from arbitrary
// origins — a bare `fetch()` from the static page is blocked by the browser
// before it ever reaches Anthropic. This Worker sits in between: the page
// calls the Worker (which the Worker allows via CORS), the Worker attaches
// the real Anthropic API key server-side and forwards the request, so the
// key never touches the browser at all.
//
// Setup (see ../worker/README.md for the full walkthrough):
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler secret put APP_SHARED_SECRET
//   wrangler deploy

const ALLOWED_ORIGIN = 'https://dirtyk.github.io';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret, anthropic-beta',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden: bad origin (got ' + JSON.stringify(origin) + ')', { status: 403, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
    }

    // Lightweight gate so a scraped Worker URL alone isn't enough to run up
    // your Anthropic bill. This is NOT strong security (it's visible in the
    // page's JS to anyone who views source) — the real backstop is setting a
    // spend limit on your Anthropic API key in the Console. See the README.
    if (!env.APP_SHARED_SECRET) {
      return new Response('Forbidden: APP_SHARED_SECRET is not set on the Worker', { status: 403, headers: corsHeaders(origin) });
    }
    if (request.headers.get('X-App-Secret') !== env.APP_SHARED_SECRET) {
      return new Response('Forbidden: shared secret mismatch', { status: 403, headers: corsHeaders(origin) });
    }

    let body;
    try {
      body = await request.text();
    } catch (e) {
      return new Response('Bad request', { status: 400, headers: corsHeaders(origin) });
    }

    // Forward the anthropic-beta header when the client sets one (e.g. Quick
    // mode's Fast Mode request) -- Anthropic beta features are opted into per
    // request via this header, so pass through whatever the client asked for.
    const upstreamHeaders = {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'user-agent': 'draft-annihilator-proxy/1.0 (Cloudflare Worker)',
    };
    const beta = request.headers.get('anthropic-beta');
    if (beta) upstreamHeaders['anthropic-beta'] = beta;

    let upstream;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: upstreamHeaders,
        body,
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: 'Upstream request to Anthropic failed: ' + e.message } }), {
        status: 502,
        headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const responseBody = await upstream.text();
    if (!responseBody && !upstream.ok) {
      // Anthropic's own errors always carry a JSON body (see their API docs),
      // so an empty error body means something in front of Anthropic's app
      // (a WAF/edge layer) rejected the request before it got that far --
      // e.g. a malformed x-api-key header. Surface the bare status so it's
      // distinguishable from a genuine Anthropic-issued error.
      return new Response(JSON.stringify({ error: { message: 'Request was rejected before reaching Anthropic (empty error body, status ' + upstream.status + '). Check that ANTHROPIC_API_KEY is set correctly.' } }), {
        status: upstream.status,
        headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
      });
    }
    return new Response(responseBody, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
