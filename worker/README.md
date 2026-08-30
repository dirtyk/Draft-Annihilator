# Fantasy Analyst proxy (Cloudflare Worker)

The Draft Annihilator app is a static site on GitHub Pages, and Anthropic's
API doesn't allow direct browser requests from arbitrary origins (no CORS
headers). This Worker proxies requests from the page to Anthropic, holding
your API key as a server-side secret so it never touches the browser.

## One-time setup

**Use PowerShell, not `cmd.exe`**, for every step below on Windows — `cmd.exe`
paste can silently mangle secret values (see the pitfalls list at the bottom).
If `npx`/`wrangler` gets blocked by PowerShell's script policy, run
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first (safe —
affects only that one window).

1. **Install wrangler** (Cloudflare's CLI) if you don't have it:
   ```bash
   npm install -g wrangler
   ```
   (or just use `npx wrangler ...` for every command below without installing globally)

2. **Log in** (opens a browser to sign in / create a free Cloudflare account):
   ```bash
   wrangler login
   ```

3. **From this `worker/` directory**, set your two secrets.** Always pipe
   them in rather than typing into the interactive prompt directly** — this
   guarantees no stray trailing whitespace/newline sneaks in:
   ```powershell
   $key = Read-Host "Paste your Anthropic API key"
   ($key.Trim()) | wrangler secret put ANTHROPIC_API_KEY
   ```
   Use a key created **from inside a specific workspace's own API Keys page**
   (`platform.claude.com/settings/workspaces/<id>/keys` → Create Key), not a
   personal/identity-linked key — those require an extra `anthropic-workspace-id`
   header this Worker doesn't send, and fail with `invalid_request_error:
   anthropic-workspace-id is required...`. Note: Console shows a new key's
   value exactly once, at creation — copy it immediately from that dialog.
   ```powershell
   $secret = Read-Host "Paste a random shared secret"
   ($secret.Trim()) | wrangler secret put APP_SHARED_SECRET
   ```
   Any long random string you make up works — e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   This is NOT your Anthropic key — it's just a shared password between the
   app and the Worker so a randomly-discovered Worker URL alone can't be used
   to run up your bill. Remember it — you'll paste the same value into the
   app's "Analyst Setup" dialog.

4. **Deploy:**
   ```bash
   wrangler deploy
   ```
   The first deploy on a fresh Cloudflare account will prompt to register a
   `workers.dev` subdomain — say yes and pick a name. This prints your
   Worker's URL, something like:
   ```
   https://draft-annihilator-proxy.<your-subdomain>.workers.dev
   ```
   A brand-new subdomain's SSL cert can take a couple of minutes to propagate
   — if requests fail with a TLS/handshake error right after the first
   deploy, wait a few minutes and try again.

5. **Make sure the API key's workspace has billing set up** — a key with no
   credit balance fails with `Your credit balance is too low...` even though
   auth succeeded. Add a payment method / credits under
   platform.claude.com/settings/billing.

6. **In the app**, click the ⚙️ button next to "🤖 Analyst" and paste in:
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
