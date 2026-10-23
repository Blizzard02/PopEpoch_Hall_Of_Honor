# Pop Epoch — Hall of Honor Guild Titles

A free, no-install web page for **Pop Epoch** guilds. Members upload a screenshot of their
**Hall of Honor** and the page works out which of the 16 titles they have (and how many times),
then saves it into the guild's Google Sheet. Leaders get statistics and a hidden toolkit for planning events.

Runs entirely on **Google Apps Script** — no server, no cost, and members don't need a Google account.

> Unofficial fan project. Not affiliated with or endorsed by the developers of Pop Epoch.

## Features

**For members** (big text and buttons, made with less tech-savvy players in mind)
1. Pick your name → 2. choose your Hall of Honor screenshot → 3. check the result (fix any number with − / +) → 4. Save.
- Works with screenshots from any phone size, even if slightly scrolled.
- Screenshots are read on the member's phone and are **never uploaded or stored**.

**Guild statistics** — who has each title, and for every member what they have and what they're missing.

**Leader tools** (tap *Guild statistics* 5 times, then enter the leader code)
- 🎯 **Plan event** — choose the leader's title, the elites' title and how many elites. It proposes a leader
  (members without that title who led longest ago) and elites (members without that title, fewest titles first).
  Copy the plan for Discord; after the event, **They won** adds the titles and records the leader date.
- 🏆 **Won event** — add +1 of a title to members who forgot to upload.
- 👥 **Members** — each member's last upload and last time as leader.

Every save is written to an **Upload Log** tab, so mistakes can be undone.

## Setup (about 10 minutes, once per guild)

You need a Google account. For privacy you can create one just for the guild.

### 1. Get the spreadsheet
1. Download [`template/PopEpoch_Guild_Titles_Template.xlsx`](template/PopEpoch_Guild_Titles_Template.xlsx).
2. Upload it to your Google Drive, open it, then **File → Save as Google Sheets**.
3. Add your players' names in column A of **Master Sheet** (or let them add themselves from the page).

The template has a **Master Sheet** tab plus **Officials / Lords / Overlords / Kings** tabs that fill themselves.
Using your own sheet instead? It just needs a tab named `Master Sheet` with `Player` and the 16 title names in row 1
(any order). The app adds `Last updated` and `Last leader` columns and an `Upload Log` tab on its own.

### 2. Add the code
In the sheet: **Extensions → Apps Script**, then create these 4 files and paste the contents from this project:

| File in Apps Script | Type | Paste from |
|---|---|---|
| `Code` | Script (already there — replace its contents) | [`Code.gs`](Code.gs) |
| `Config` | **+ → Script** | [`Config.gs`](Config.gs) |
| `Index` | **+ → HTML** | [`Index.html`](Index.html) |
| `Analyzer` | **+ → HTML** | [`Analyzer.html`](Analyzer.html) |

Names must match exactly.

### 3. Set your leader code
Open the **`Config`** file (the only file you ever need to edit) and change this line:

```js
var LEADER_CODE = 'CHANGE-ME';
```

to your own secret code, keeping the quotes:

```js
var LEADER_CODE = 'MySecretCode123';
```

Save 💾. Until you do this, the leader tools refuse to unlock. Don't edit `Code.gs` for this —
it only *checks* whether you changed the code.

### 4. Publish
1. **Deploy → New deployment** → ⚙️ → **Web app**.
2. **Execute as: Me** and **Who has access: Anyone**.
   (Not "User accessing the web app" — that would make every member log in.)
3. **Deploy → Authorize access**. Google warns the app is unverified; that's normal for your own script:
   **Advanced → Go to (project name) (unsafe) → Allow**.
4. Copy the **Web app URL** (ends in `/exec`) and share it, e.g. as a pinned Discord message:
   `[📷 Upload your Hall of Honor titles](https://script.google.com/macros/s/…/exec)`

Test the link once in a private/incognito window: it should open with no login.

### Updating later
Paste the new `Code`, `Index` and `Analyzer` (**keep your `Config`** — it holds your leader code), Save, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
This keeps the same link. (*New deployment* would create a new link.)

## Good to know
- Saving a screenshot **replaces** all 16 counts for that member with what the screenshot shows.
- You can edit the sheet by hand; the page reads it fresh each time it's opened. Don't rename the row-1 headers or the `Master Sheet` tab.
- Anyone with the link can save for any name, so keep the link inside your guild.
- If a member gets "unable to open the file", they are probably signed into several Google accounts: open the link in a private window or another browser.

## How the screenshot reading works
No AI and no OCR service — just simple image checks in the browser (`Analyzer.html`):

1. **Normalize** — the screenshot is scaled to 900 px wide; the game layout scales with width, so only the vertical position varies.
2. **Align** — the average brightness of each pixel row forms a "fingerprint" curve, which is slid against a reference curve (`REF_PROFILE`) to find the vertical shift. A poor match (< 0.8 correlation) means "this isn't the Hall of Honor".
3. **Owned or not** — each of the 16 pedestal plates (`TITLES`) is checked for colour: owned pedestals are gold (saturation ≈ 0.55–0.62), missing ones are grey (≈ 0.00).
4. **Count** — the white digit on the plate is isolated, split into digits, reduced to an 8×12 grid and matched against stored digit shapes (`DIGIT_TEMPLATES`, from real screenshots for 1–4, browser-drawn for 0 and 5–9). Uncertain readings are highlighted for the member to check.

Tested on screenshots from 4 different phones: 64/64 titles and 34/34 counts read correctly.

If a game update moves the Hall of Honor layout, `TITLES` and `REF_PROFILE` need re-measuring from a new screenshot — contributions welcome!

## Credits & license
Made by **Nouk** ([Blizzard02](https://github.com/Blizzard02)).

Free to use, change and share under the [MIT License with an attribution requirement](LICENSE):
keep the visible **"Powered by Nouk"** credit (bottom-right of the page) linking back to this project.
