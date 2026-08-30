# Fantasy Analyst proxy (Cloudflare Worker)

The Draft Annihilator app is a static site on GitHub Pages, and Anthropic's
API doesn't allow direct browser requests from arbitrary origins (no CORS
headers). This Worker proxies requests from the page to Anthropic, holding
your API key as a server-side secret so it never touches the browser.

## One-time setup

1. **Install wrangler** (Cloudflare's CLI) if you don't have it:
   ```bash
   npm install -g wrangler
   ```

2. **Log in** (opens a browser to sign in / create a free Cloudflare account):
   ```bash
   wrangler login
   ```

3. **From this `worker/` directory**, set your two secrets:
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```
   Paste your real Anthropic key (from platform.claude.com/settings/keys) when prompted.
   ```bash
   wrangler secret put APP_SHARED_SECRET
   ```
   Paste any long random string you make up (e.g. from a password generator).
   This is NOT your Anthropic key — it's just a shared password between the
   app and the Worker so a randomly-discovered Worker URL alone can't be used
   to run up your bill. Remember it — you'll paste the same value into the
   app's "Analyst Setup" dialog.

4. **Deploy:**
   ```bash
   wrangler deploy
   ```
   This prints your Worker's URL, something like:
   ```
   https://draft-annihilator-proxy.<your-subdomain>.workers.dev
   ```

5. **In the app**, click the ⚙️ button next to "🤖 Analyst" and paste in:
   - The Worker URL from step 4
   - The `APP_SHARED_SECRET` value from step 3

That's it — the analyst panel will now work.

## Real security backstop: set a spend limit

Because this app's source is public, anyone who reads the JS can see the
Worker URL and the shared secret. The CORS origin check and shared-secret
header raise the bar against casual abuse, but they are not a strong
guarantee against a determined person hitting the Worker directly (bypassing
the browser entirely, e.g. with `curl`). **The real protection is Anthropic's
own spend limit**: set a monthly cap on this API key in the Console
(platform.claude.com → Settings → Billing / Rate limits) so a worst case is
capped, not unbounded.

## Updating the Worker later

Edit `worker.js`, then re-run `wrangler deploy`. The URL and secrets stay the
same unless you change them.

## Cost

Cloudflare Workers' free tier covers 100,000 requests/day — far more than a
live draft will ever use. You're billed by Anthropic only for actual Claude
API usage (same as calling it any other way).
