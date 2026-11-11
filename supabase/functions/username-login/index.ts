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
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}"))[0];
  if (!url || !serviceKey || !publicKey) return json({ error: "service_unavailable" }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: account, error: lookupError } = await admin
    .schema("private")
    .from("user_accounts")
    .select("email,is_active")
    .eq("username", username)
    .maybeSingle();

  // Return the same response for unknown and disabled users to avoid account enumeration.
  if (lookupError || !account?.is_active) return json({ error: "invalid_credentials" }, 401);

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
