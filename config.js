/* Where the app's data lives: the "api" Edge Function on Supabase (project "Grooming App").
   It checks each person's PIN, role and sites; the tables themselves are not reachable from the internet. */
window.GROOMING_API = "https://obwfcrhwncuebgvygeqi.supabase.co/functions/v1/api";

/* Local testing (`node dev/server.mjs`) always uses the local test backend, never the live data. */
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.GROOMING_API = "/api";
