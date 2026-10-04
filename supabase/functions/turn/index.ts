// v32 TURN credentials for the game (Supabase Edge Function "turn", project sf2-tactical).
// Players behind strict networks (mobile hotspots, office / school Wi-Fi) cannot connect peer-to-peer; a TURN server
// relays their traffic. The provider's key stays here (never in the browser); the game gets the ICE servers to use.
// Secrets (Supabase dashboard → Edge Functions → Secrets), whichever is set:
//   Metered (500 MB / month free, no card):  METERED_APP (the part before .metered.live), METERED_API_KEY
//   Cloudflare (1,000 GB / month free, card): CF_TURN_KEY_ID, CF_TURN_TOKEN — short-lived (2 h) credentials
// Without them it answers { configured: false } and the game keeps its STUN-only (direct) connections.
// verify_jwt is off: the game calls it with the publishable key (not a JWT); requests are limited to the game's origins.
const ALLOWED = [/^https:\/\/weiweiweiweiweiweiweiwei\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^null$/]; // Pages, local tests, a double-clicked file://
const cors = (origin: string) => ({ 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' });
let cache: { at: number; body: string } | null = null; // one set of credentials per instance for 30 min (they last 2 h)

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? 'null', h = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (!ALLOWED.some((r) => r.test(origin))) return json({ iceServers: [], error: 'origin' }, 403);
  const app = Deno.env.get('METERED_APP'), mkey = Deno.env.get('METERED_API_KEY'), id = Deno.env.get('CF_TURN_KEY_ID'), token = Deno.env.get('CF_TURN_TOKEN');
  if (!(app && mkey) && !(id && token)) return json({ iceServers: [], configured: false });
  if (cache && Date.now() - cache.at < 30 * 60e3) return new Response(cache.body, { headers: { ...h, 'Content-Type': 'application/json' } });
  try {
    let d: { iceServers?: unknown } | unknown[];
    if (app && mkey) {
      const host = app.replace(/^https?:\/\//, '').replace(/\.metered\.live.*$/, '');
      const r = await fetch(`https://${encodeURIComponent(host)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(mkey)}`);
      if (!r.ok) return json({ iceServers: [], configured: true, error: `metered ${r.status}` }, 502);
      d = { iceServers: await r.json() };
    } else {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id!)}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 7200 }),
      });
      if (!r.ok) return json({ iceServers: [], configured: true, error: `cloudflare ${r.status}` }, 502);
      d = await r.json();
    }
    // browsers refuse TURN on port 53; keep the rest (UDP/TCP 3478, TLS 5349 / 443)
    const list = (d as { iceServers?: unknown }).iceServers;
    const ice = (Array.isArray(list) ? list : [list]).filter(Boolean).map((s: { urls: string | string[]; username?: string; credential?: string }) => ({ ...s, urls: ([] as string[]).concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }));
    const body = JSON.stringify({ iceServers: ice, configured: true });
    cache = { at: Date.now(), body };
    return new Response(body, { headers: { ...h, 'Content-Type': 'application/json' } });
  } catch (e) {
    return json({ iceServers: [], configured: true, error: String(e).slice(0, 80) }, 502);
  }
});
