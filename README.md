# Instagram Feed Sorter

Sort Instagram Reels and posts by views, likes, comments, engagement, outlier score or date. Save the useful ones, download media, and export your research.

**[Download the latest extension ZIP](https://github.com/princenhammai/instagram-feed-sorter/releases/latest)** · [Installation guide](INSTALL.md) · [Hướng dẫn tiếng Việt](docs/INSTALL.vi.md)

No Node.js, API key, server or developer setup is needed for normal sorting. Each person uses their own signed-in Instagram session.

![Instagram Feed Sorter popup](docs/images/sorter-popup.jpg)

## Install in a desktop browser

1. Open [Releases](https://github.com/princenhammai/instagram-feed-sorter/releases/latest) and download **`instagram-feed-sorter-v<VERSION>.zip`** under Assets. GitHub's “Source code” archives are for developers and need building.
2. Extract the ZIP into a folder you will keep, such as `instagram-feed-sorter`.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the extracted folder containing `manifest.json`.
5. Open Instagram in the same browser, sign in, open a profile's Reels tab, and choose a sort from the extension popup.

This follows Chrome's [official unpacked-extension installation flow](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked). GitHub hosts the download; the extension is not currently listed in the Chrome Web Store.

The release also includes `instagram-feed-sorter-breakdown-v<VERSION>.zip` (an experimental local video-notes script), `SHA256SUMS.txt`, and `RELEASE_NOTES.md`. Check a download with `sha256sum -c SHA256SUMS.txt` from the folder that contains the files.

## Quickstart

Each tool uses the Instagram session already in this browser. None of them like, follow, comment, or message.

### Research panel

1. Open Instagram and sign in.
2. Choose **Research** on the page, or **Open research** in the extension popup.
3. Paste seed handles. For Snowball, add keywords too. Choose **Batch** or **Snowball**, then **Run**.
4. Progress stays in the panel. **Pause** and **Resume** are on that same panel. A reload continues the saved run. Errors stay on the panel.
5. The results table sorts by × median (the default), engagement, or views. Paid reels are hidden until you check **Show paid**.
6. **Export** saves an Excel file of the rows you are looking at. **Download top 10** saves those videos. **Sync** sends them to Google Sheets or Notion when that option is already on.

Batch and snowball each have a Reels-per-account field (100 and 30 by default). That number stays where you left it after Run reloads the tab, and the field only accepts digits. Each account keeps the reels from the first response, scrolls the last reel tile into view and the window to the bottom, and waits up to 2.5 seconds for the next page (longer while a request is still in flight). It stops at the target, after ten quiet rounds, or at 90 seconds or 3 seconds per target reel, whichever is longer, and never waits more than 5 minutes. The request log includes how many pages were fetched. A stuck account is skipped with that reason, and the batch moves on. A batch that finishes with no reels stays paused and does not export an empty file. The run pauses for rate limiting only on HTTP 429 or a body with `feedback_required`. The request log on the panel shows the status, URL, and response snippet. Snowball shows Max to expand (default 20) and Max depth (default 2). Every seed and keyword account is scored first. Then it expands that many STRONG accounts and keeps going until max depth, unless the daily cap of scored accounts is hit or a finished depth is under 20% STRONG. A keyword opens `https://www.instagram.com/explore/search/keyword/?q=` and reads accounts from the search results, up to 10 keywords and 15 accounts each. Sidebar, suggested, and following accounts are left out. The handles are listed on the panel and in the request log, then join round 0 with provenance `search: <keyword>`. Profile lookups prefer an id already on the page and wait 1.2 seconds between `web_profile_info` calls. Those other snowball thresholds stay fixed for this pass.

Handles and keywords are typed in the on-page panel. Keystrokes stay in that panel, so Instagram shortcuts do not take focus. The popup only opens the panel and can resume a paused run. Find accounts stays on the right side of a profile or Reels tab.

### Account finder

1. Open a profile while signed in.
2. Choose **Find accounts** on the right side of the page. The search starts immediately and the panel stays open.
3. Suggested accounts and the following list appear in that panel. An empty result and any Instagram error, including the HTTP status, stay on the panel.
4. Set how far to walk suggestions and how many following accounts to read, then choose **Collect** to run again. The same delay applies between requests.
5. Export the new rows, or send them into the batch runner.

### Sheets and Notion

1. Open the extension options page. Both switches start off.
2. For a Google Sheet, turn the sheet switch on. The sheet is created with the Google account already signed in to this browser when a batch finishes.
3. For Notion, paste an integration token and a database URL, then turn Notion on. The token stays in extension storage.
4. In that database, use a title for the account and, if you want the numbers filled in, number properties named `Median views`, `Reels loaded`, `Reels at 3x`, and `Followers`, plus a URL property `Top reel`. Snowball also fills rich text properties named `Grade` and `Provenance` when those columns exist.
5. Run a batch or a snowball. One summary row is added per account, spaced by the delay. Notion receives at most 40 rows; a snowball sends STRONG accounts first.

### Download top N

1. Sort the grid the way you want to review it.
2. Choose **Download top N**. Files are named `rank01_<handle>_<shortcode>.mp4` and saved without a dialog per file.
3. Send those files to the AI model you use for video review.

`tools/breakdown.py` is experimental. It can write a local contact sheet, scene cuts, a transcript, and OCR, and it is not the video-analysis path. Install notes are in [tools/INSTALL.md](tools/INSTALL.md).

## Device support

| Browser / device | Status |
| --- | --- |
| Current desktop Chrome on Windows, macOS, Linux or ChromeOS | Primary target; use Chrome 111 or later |
| Desktop Microsoft Edge | Chromium-compatible target; load via `edge://extensions`; not independently browser-tested |
| Other desktop Chromium browsers | May work where the required extension APIs are available; not independently tested |
| Chrome on Android/iPhone/iPad, the Instagram mobile app | Not supported by this package |
| Safari or Firefox | Requires a separate extension port; not supported by this build |

The extension is portable across desktop operating systems. GitHub hosting does not turn a Chrome extension into a phone/tablet app. Google's phone installation flow [adds an extension to your desktop](https://support.google.com/chrome/answer/2664769); it does not run this package on your phone. Microsoft documents [Chrome-to-Edge compatibility](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension), with API checks and testing required.

## Features

- Sort by views, likes, comments, outlier score, engagement rate, duration, views versus the median of the loaded set, likes per view, comments per view, newest or oldest.
- Select 25, 50, 100, 200, 1000, all or a custom number; use date presets or a custom range where supported.
- Filter results, hide likely-paid posts, and inspect them in the built-in player or on Instagram. A post is marked likely paid when the caption has `#ad`, `#sponsored`, or a paid-partnership tag, when Instagram marks it as a paid partnership, or when its likes per view are under 10% of the loaded set's median like rate while its views are at least that median.
- Show the audio or song name and video duration when Instagram includes them.
- Export Google Sheets, Excel, CSV, JSON or clipboard data. CSV, JSON and Excel files are written into the downloads folder, and a failed save is reported instead of a success message.
- Download the top videos in the current sort as `rank01_<handle>_<shortcode>.mp4` with no save dialog per file. Download other media and keep posts in local folders with the Library.
- Batch a pasted list of handles into one CSV and one Excel file, with a per-account summary sheet. Optional Google Sheet or Notion sync is off until you turn it on. Find suggested and following accounts from a profile and send them to that batch.
- One research panel on the Instagram page: paste seeds, run a batch or snowball, watch progress, then sort the results by × median, engagement, or views. Paid reels are hidden until you show them. Export, Download top 10, and Sync are one click each. Resume stays on the panel.
- Optional video transcription using your own Whisper-compatible provider/key.
- View related accounts suggested by Instagram from the Sorter overlay.

## Batch runner

The short version is under Quickstart. The research panel's Batch mode defaults to 100 Reels per account and a 1200 ms delay. The same field accepts up to 200 Reels.

The tab visits each profile's Reels page, keeps reels from the first response, then scrolls the last reel tile into view and the window to the bottom. Each round waits up to 2.5 seconds for a new page and stays open while a request is in flight. It stops at the target, after ten quiet rounds, or at the scaled time limit (90 seconds, or 3 seconds per target reel, and at most 5 minutes). The request log records the reel count and the pages fetched. A timed-out account is skipped and the reason is written in the request log. Direct clips and feed calls that return HTML are not the loader. If every account comes back with zero reels, the batch stays paused and does not write the export. The export, when the grid did return reels, is one CSV of every Reel, one Excel workbook, and an HTML summary chart. The workbook has a Reels sheet, a New reels sheet, and a Summary sheet (reels loaded, median views, top Reel, how many Reels are at 3× the account median, and how many were already seen). Each Reel row includes the caption hook: the first line that still says something after hashtags and @mentions are removed. Pause keeps the finished accounts. Resume continues at the same handle. A paused batch that collected no reels starts again from the first handle. Profile and search calls still wait about 2s, 5s, and 10s on a literal HTTP 429, and `web_profile_info` waits 1.2 seconds between calls, or 15 seconds after a 429. An id already on the page is used instead of that lookup. The request log lists each status, URL, and response snippet. A phrase such as "please wait" or "try again later", or the digits 429 inside a longer payload, does not pause the job. HTTP 429 and `feedback_required` do, and the job stays on that account. Shortcodes already exported on this browser are marked Seen before and left off the New reels sheet, so a later run does not treat them as new discoveries. The HTML file charts median views and 3× Reels per account.

## Snowball research

The short version is under Quickstart. The panel uses these defaults and does not expose the full threshold form. Paste 10–20 handles, and optionally up to 10 keywords. Max to expand defaults to 20 and Max depth defaults to 2; both are on the Snowball panel. Max to expand is how many STRONG accounts are opened to discover more. It does not stop the crawl before that expansion. The crawl opens each keyword on `https://www.instagram.com/explore/search/keyword/?q=` and reads accounts from that page's result column. A GraphQL response is used only when the request itself carries the keyword, and suggested, following, and chaining lists inside it are ignored. The handles are shown on the panel and in the request log. It keeps up to 15 accounts per keyword. It waits the same delay between accounts, and does not follow, like, comment, or message. Accounts already in the seed list are not added again. A new account is queued at depth 0 with provenance `search: barber`. The same account found for a second keyword is still one candidate, with provenance `search: barber; search: fade`. The crawl then scores one account at a time with that grid capture, until the reel target is met, ten quiet rounds pass, or the scaled time limit is reached (default 30 reels, up to 100). It then classifies the account:

- **STRONG** when unpaid Reels at or above 3× that account's median views meet your count (default 2) and the median itself meets your floor (default 10,000). Leave the engagement percent blank to skip that check. A value of `1` requires a median engagement rate of at least 1%.
- **MAYBE** when the account misses STRONG but still has at least one unpaid 3× Reel and a median of at least 1,000 views.
- **WEAK** otherwise. An account that returns no Reels is recorded as an error and is not expanded.

A Reel with `#ad`, `#sponsored`, `#paidpartnership`, or Instagram's paid-partnership flag is left out of the 3× count, as is a Reel whose like rate is under 10% of the set's median while its views are at least that median.

Only STRONG accounts are expanded. The crawl reads up to 40 following accounts and up to 20 suggested accounts, waits at least 400 ms between requests (default 1200), and does not follow, like, comment, or message. Handles already seeded, queued, or scored are not added again. A candidate's priority is how many distinct STRONG accounts follow or suggest it. Optional minimum and maximum follower counts skip candidates whose count is known and outside the range; a missing count is kept.

Depth 0 is the seed list plus the keyword accounts, and those accounts are scored before expansion starts. Each expansion adds the next depth, up to Max to expand STRONG accounts (default 20). The crawl stops when that many STRONG accounts have been expanded and nothing further is queued, when max depth is reached (default 2), or when a finished depth is under the STRONG ratio (default 20%). It also pauses at the daily cap (default 40 scored accounts per UTC day) and continues when you resume on a later UTC day. HTTP 429 or `feedback_required` during search pauses on that keyword and keeps accounts already read. Other failures are listed in the request log and the crawl continues. Seen handles, the queue, scores, sources, keywords, and depth are stored in `chrome.storage.local`, so a reload or crash resumes the same crawl.

The export is a CSV and an Excel workbook with an Accounts sheet and a Queue sheet. Provenance reads `seed`, `search: barber`, `followed by A, B`, or `suggested by A`. If Sheets or Notion is already enabled, the same finish step can create a Sheet or send summary rows. Notion maps `Grade` and `Provenance` only when the database has rich text properties with those names.

## Account finder

On a profile or Reels tab, **Find accounts** sits on the right. Choosing it opens the panel and starts a read of suggested accounts and the following list. Candidates stay listed in the panel. If Instagram returns nothing, or a request fails, that outcome stays in the panel with the HTTP status and response text. A failure on the following list does not discard suggestions that already came back. New handles are stored on this browser, deduped, and labeled with a source such as `suggested from ada`. Export the new rows, or send them straight into the batch runner. This does not follow, like, or message anyone. The snowball threshold form stays off the panel; snowball uses the fixed defaults above.

## Sheets and Notion

The short version is under Quickstart. Open the extension's options page. Sync is off by default.

- Google Sheet uses the Google account already signed in to this browser. When a batch finishes, the merged Reel rows are created as a spreadsheet.
- Notion uses an integration token and database URL you paste there. The token stays in extension storage. Summary rows (one per account) are added only when Notion is checked. Name number properties `Median views`, `Reels loaded`, `Reels at 3x`, and `Followers`, and a URL property `Top reel`, if you want those filled. The database title receives the account name. Requests are spaced by the batch delay.

## Video breakdown

Experimental, and not the supported way to review videos. Download top N names files `rank01_<handle>_<shortcode>.mp4` so those downloads can be sent to an AI model.

The script is still available for a local contact sheet, scene cuts, a transcript, and OCR. Install steps for ffmpeg, tesseract, and the local transcriber are in [tools/INSTALL.md](tools/INSTALL.md). The same instructions ship inside `instagram-feed-sorter-breakdown-v<VERSION>.zip`. It does not need an API key.

```sh
python3 tools/breakdown.py "/path/to/rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny
python3 tools/breakdown.py ./downloads --whisper-model base
```

Each video gets `breakdowns/<name>/<name>.md`, a JSON file, `contact.jpg` (a frame about every 2 seconds), and `first-second.jpg`. Scene cuts come from ffmpeg. A transcript is added when faster-whisper imports or `whisper-cli` is on PATH with `--whisper-model` set to a model name or a local whisper.cpp model file. On-screen text is read from full-size frames when `tesseract` is on PATH. The first run of faster-whisper downloads the chosen model once.

## Data and optional services

Saved posts, media, settings and transcripts stay in this browser. Libraries do not automatically sync between devices. Export/download important saved media before moving or removing an installation.

Sorting uses the Instagram session already in your browser; the extension does not ask for your Instagram password. Google Sheets exports use your own Google session. Transcription sends the selected video/audio to the provider you configure and may incur provider charges. It is optional. See [privacy and permissions](PRIVACY.md).

The extension reads Instagram's web responses. Instagram can change them, hide metrics or limit requests. Start with 25–50 posts. Missing metrics stay unavailable. Browser UI preview and automated tests do not establish full live compatibility on every browser/OS.

## Update an existing installation

Extract a newer release and replace files in the **same folder** you already loaded. Click **Reload** in your browser's Extensions page, then refresh Instagram. Keep the folder path and existing installed extension to preserve its local identity and library.

## Build from source

Use Node.js 22 or newer (CI uses Node 24):

```sh
git clone https://github.com/princenhammai/instagram-feed-sorter.git
cd instagram-feed-sorter
npm ci
npm run typecheck
npm test
npm run test:mcp
npm run package
```

Load `dist/` as an unpacked extension. `artifacts/` receives `instagram-feed-sorter-v<VERSION>.zip`, `instagram-feed-sorter-breakdown-v<VERSION>.zip`, `RELEASE_NOTES.md`, and `SHA256SUMS.txt`. `npm run package:zip` packages an existing production build. The same Node-based packaging script runs on Windows, macOS and Linux.

The advanced local agent bridge is optional; ordinary extension use needs no bridge. See [advanced setup](docs/DEVELOPMENT.md).

## License

[MIT](LICENSE). Bundled dependency notices are included in the release ZIP. This project is independent of Instagram and Meta.
