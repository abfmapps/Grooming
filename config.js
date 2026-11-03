/* Paste your Google Apps Script "Web app" URL between the quotes (see README, step 2). */
window.GROOMING_API = "https://script.google.com/macros/s/AKfycbx69TyXw1AsTTgsPCOQDZ3KNevBsEcEG2dABYS2BGOvjMyUJjzMxtcwWJepI0Q-A7ZU/exec";

/* Local testing (`node dev/server.mjs`) always uses the local test backend, never the live Sheet. */
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.GROOMING_API = "/api";
