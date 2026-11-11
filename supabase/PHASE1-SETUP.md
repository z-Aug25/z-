# Our Little World — Phase 1 setup

This phase supports only the two fixed accounts Z and C. There is no public sign-up. Passwords are stored and verified by Supabase Auth, never in this repository.

## 1. Create the two Auth users

In Supabase Dashboard, open **Authentication → Users → Add user**. Create two confirmed users with these email identifiers:

- Z: `z@ourlittleworld.invalid`
- C: `c@ourlittleworld.invalid`

Set each password directly in the dashboard and keep it private. These reserved `.invalid` email identifiers are internal login identities; no email needs to be delivered. Do not put passwords in SQL, source files, GitHub, or chat.

## 2. Apply the security migration

After both Auth users exist, run `supabase/phase1-security.sql` in **SQL Editor**. It creates the private username mapping, seeds only Z and C, and replaces the previous broad policies so only active mapped users can access the shared journal.

## 3. Deploy the login Edge Function

From a trusted computer with the Supabase CLI:

```sh
supabase login
supabase link --project-ref lxuerenwrvhlmxuhbxtr
supabase functions deploy username-login --no-verify-jwt
```

The function needs access to the built-in server-side Supabase service key and public Auth key. Supabase injects these into Edge Functions. Do not paste them into GitHub Pages or `config.js`. The custom secret named `XYQ-ZRJ` is not read by this function and is not required.

## 4. Disable public registration

In **Authentication → Settings / Providers → Email**, turn off new-user sign-ups. Existing users can still sign in.

## 5. Verify

Open the Pages site. Try a wrong password (friendly error), then sign in as Z and C with their dashboard passwords. Both should see the same shared journal. Sign out and open the site again; private content should remain hidden. A direct URL cannot bypass the database RLS checks.

## Important

Run the SQL only after both users are created. Running it earlier seeds no aliases, so login will reject both names. If the function deployment command or SQL reports an error, stop and share the error text without sharing any secret values.
