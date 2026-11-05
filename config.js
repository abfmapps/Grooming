/* Where the app's data lives: the "api" Edge Function on Supabase (project "Grooming App").
   It checks each person's sign-in, role and sites; the tables themselves are not reachable from the internet.
   GROOMING_SB is used only for dashboard admins' email + password sign-in (Supabase Auth). The key is the
   public "publishable" key: it is meant to be in the app and gives no access to any data. */
window.GROOMING_API = "https://obwfcrhwncuebgvygeqi.supabase.co/functions/v1/api";
window.GROOMING_SB = { url: "https://obwfcrhwncuebgvygeqi.supabase.co", key: "sb_publishable_eHMDbooLi9V8WJEEdoMknQ_qRnjXQRZ" };

/* Local testing (`npm run demo`) always uses the local test backend, never the live data. */
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.GROOMING_API = "/api";
  window.GROOMING_SB = { url: location.origin, key: "local" };
}
