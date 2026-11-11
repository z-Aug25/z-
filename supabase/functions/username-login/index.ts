// Username-to-email bridge for the two pre-created Supabase Auth accounts.
// Password verification is delegated to Supabase Auth; no credentials are stored here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const origin = "https://z-aug25.github.io";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST" || request.headers.get("Origin") !== origin) {
    return json({ error: "invalid_request" }, 400);
  }

  let username = "";
  let password = "";
  try {
    const body = await request.json();
    username = String(body.username ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  } catch {
    return json({ error: "invalid_credentials" }, 400);
  }
  if (!/^[a-z0-9_-]{1,32}$/.test(username) || password.length < 1 || password.length > 128) {
    return json({ error: "invalid_credentials" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  function firstKey(legacyName: string, dictionaryName: string): string | undefined {
    const legacy = Deno.env.get(legacyName);
    if (legacy) return legacy;
    try {
      const values = Object.values(JSON.parse(Deno.env.get(dictionaryName) ?? "{}"));
      return values.find((value): value is string => typeof value === "string");
    } catch { return undefined; }
  }
  const serviceKey = firstKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  const publicKey = firstKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  if (!url || !serviceKey || !publicKey) return json({ error: "service_unavailable" }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: accounts, error: lookupError } = await admin.rpc("lookup_login_account", {
    p_username: username,
  });
  const account = Array.isArray(accounts) ? accounts[0] : null;
  if (lookupError || !account?.is_active || !account?.email) return json({ error: "invalid_credentials" }, 401);

  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publicKey },
    body: JSON.stringify({ email: account.email, password }),
  });
  const auth = await response.json().catch(() => ({}));
  if (!response.ok || !auth.access_token || !auth.refresh_token) {
    return json({ error: "invalid_credentials" }, 401);
  }
  return json(auth);
});
