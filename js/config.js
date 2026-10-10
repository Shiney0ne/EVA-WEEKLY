// ─────────────────────────────────────────────────────────────
//  Settings. This is the only file you need to edit.
//  Never put the PTV user ID or API key here: they go in Supabase secrets (see README).
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  // Supabase project (Project Settings → API). Leave both blank to run
  // in DEMO mode, where data is saved only in this browser.
  // The anon / publishable key is meant to be public; the database rules protect the data.
  SUPABASE_URL: "https://dlohmuglhdngovksogac.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsb2htdWdsaGRuZ292a3NvZ2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MDEwOTgsImV4cCI6MjEwNzE3NzA5OH0.NodPFSVZwS65fKNB-ifDHC9j7sD5WDau_X9RZNSrbX4",

  // The two Supabase users you create. Each "code" is that user's password
  // (Supabase needs at least 6 characters; 8+ digits is better).
  PARENT_EMAIL: "parent@family.local",
  CHILD_EMAIL: "eva@family.local",

  // Personal touches
  CHILD_NAME: "Eva",
  MASCOT: "images/mascot.svg",            // swap for any picture Eva likes (put it in images/)
  MASCOT_SLEEPING: "images/mascot-sleep.svg",

  SHOW_WEEKENDS: true,
  DEFAULT_VIEW: "week",        // "week" or "day" (Eva can switch; the tablet remembers her choice)
  REFRESH_MINUTES: 2,          // how often the kiosk reloads the calendar
  IDLE_RETURN_SECONDS: 90,     // kiosk jumps back to today after no touches

  // Codes used only in DEMO mode
  DEMO_CODES: { parent: "111111", child: "222222" },

  // Live departures from PTV (Victoria).
  // The stops are NOT set here: this file is public. They are Supabase secrets
  // (PTV_STOP_ID, PTV_DEST_STOP_ID, PTV_DEST_NAME); see README.
  BUS: {
    ENABLED: true,
    ROUTES: [],                // route numbers to show, e.g. ["200", "207"]; empty shows all
    DIRECTIONS: [],            // e.g. ["City"]; empty shows all
    REFRESH_SECONDS: 60,
    MAX_DEPARTURES: 3,
    ACTIVE_HOURS: [["07:30", "10:30"]],  // only show the bus panel 7:30–10:30 am; [] means all day
    ACTIVE_DAYS: [1, 2, 3, 4, 5]         // 0 Sun, 1 Mon … 6 Sat; Monday to Friday only; [] means every day
  }
};
