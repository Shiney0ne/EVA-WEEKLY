# Eva's Week: manga-style kiosk homework calendar

A 7-day landscape calendar for Eva's tablet, plus a parent portal for adding lessons and homework, with live PTV departures.

| Page | Who | What |
|---|---|---|
| `index.html` | Eva (kiosk tablet) | Mon–Sun with today highlighted, weekends in lavender, live PTV times. Tap homework to stamp it DONE! |
| `parent.html` | Parent (any device) | Add, edit, delete and repeat lessons and homework. Find PTV stop IDs. |

The site is static and hosted on **GitHub Pages**. Logins, data and the PTV keys are held in **Supabase** (free tier).

## Try it first (demo mode)

With `SUPABASE_URL` blank in `js/config.js`, the site runs in demo mode: data is saved in the browser only and the bus panel shows sample times.
Parent code `111111`, Eva's code `222222`.

## 1. Set up Supabase (about 10 minutes)

1. Create a free project at <https://supabase.com>.
2. **SQL Editor** → paste the contents of `supabase/schema.sql` → Run.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Only you create users.
4. **Authentication → Users → Add user → Create new user**, twice, ticking *Auto confirm*:
   - `parent@family.local`, password = the **parent code** (digits only, 8 or more recommended)
   - `eva@family.local`, password = **Eva's code** (digits only, 6 or more)
5. Back in the SQL Editor, run the two `insert into public.app_roles …` lines at the bottom of `schema.sql`.
6. **Project Settings → API**: copy the Project URL and the `anon` (or publishable) key into `js/config.js`.

The anon key is designed to be public. The database rules mean only the parent login can add or change entries; Eva's login can only read and tick homework done.

## 2. PTV keys: stored as Supabase secrets, never in the code

PTV requires every request to be signed with your API key, so the key can't be in a web page. A small Supabase Edge Function signs requests for the site, and only signed-in family logins can use it.

1. Supabase dashboard → **Edge Functions → Secrets** → add these secrets:

   | Name | Value |
   |---|---|
   | `PTV_DEV_ID` | your PTV user ID |
   | `PTV_API_KEY` | your PTV API key |
   | `PTV_STOP_ID` | the stop ID where Eva gets on |
   | `PTV_DEST_STOP_ID` | the stop ID where she gets off (only buses that go there are shown) |
   | `PTV_DEST_NAME` | the name shown on the kiosk, e.g. "School" |
   | `PTV_ROUTE_TYPE` | optional: 0 train, 1 tram, 2 bus (default), 3 V/Line |

   The stops are secrets on purpose: everything in this repo and on the website is public, so the code never shows where Eva travels.
2. **Edge Functions → Deploy a new function → Via Editor**. Name it exactly `ptv`, paste the contents of `supabase/functions/ptv/index.ts`, and deploy.
3. Stop IDs can be looked up in `parent.html` with **Find stop**.
4. Optional, in `js/config.js`: `ROUTES` (e.g. `["200"]`), `DIRECTIONS`, and `ACTIVE_HOURS` so the panel only shows around school times.

To change a stop or the key later, update the secret in Supabase. Nothing on GitHub changes, and the function picks up new secrets within a minute or so.

## 3. Publish on GitHub Pages

```bash
git init
```
```bash
git add . && git commit -m "Eva's week calendar"
```
```bash
gh repo create evas-week --public --source . --push
```

Then on GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
The site is at `https://<your-username>.github.io/evas-week/` and the portal at `…/evas-week/parent.html`.

A free GitHub Pages site must come from a public repo. The code is visible, but the data and PTV keys aren't: they stay in Supabase. The pages are marked `noindex` so search engines skip them.

## 4. The kiosk tablet (landscape)

- Lock the tablet to **landscape** and set the kiosk app's start URL to the site.
  - **Android / Fire:** Fully Kiosk Browser (Settings → Device → Screen orientation: Landscape; it can also keep the screen on and dim it at night).
  - **iPad:** turn on Rotation Lock in landscape, then Settings → Accessibility → Guided Access with Safari on the page.
- Sign in once with Eva's code. The login is remembered.
- To sign out on the tablet, **press and hold the clock for 3 seconds**.
- The page refreshes every 2 minutes, returns to the current week after 90 seconds untouched, and moves to the new day at midnight.

## Personalising

- `CHILD_NAME`, `MASCOT` and `MASCOT_SLEEPING` in `js/config.js`. Drop any picture Eva likes into `images/` and point `MASCOT` at it.
- Colours live at the top of `css/style.css` (`--sakura`, `--weekend`, and the rest).

## Files

```
index.html                     Eva's kiosk view
parent.html                    parent portal
css/style.css                  manga theme
images/                        mascot artwork (original, free to change)
js/config.js                   ← your settings (no secrets)
js/common.js                   dates, keypad
js/store.js                    Supabase / demo data and login
js/bus.js                      PTV departures panel
js/kiosk.js / js/parent.js     page logic
supabase/schema.sql            database + rules
supabase/functions/ptv/        PTV signing function (holds no keys)
```
