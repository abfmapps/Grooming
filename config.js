/* Paste your Google Apps Script "Web app" URL between the quotes (see README, step 2). */
window.GROOMING_API = "";

/* Local testing: `node dev/server.mjs` serves the backend at /api. */
if (!window.GROOMING_API && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.GROOMING_API = "/api";
