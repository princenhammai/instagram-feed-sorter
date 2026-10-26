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

### Batch runner

1. Open Instagram and sign in. Leave that tab open.
2. Open the extension popup and paste handles, one per line or as profile URLs.
3. Set Reels per account (up to 200) and the delay between requests (400–10000 ms, default 1200).
4. Choose **Run batch**. Use **Pause** and **Resume** in the same popup. Resume continues on the account that was in progress.
5. When it finishes, your downloads folder gets one CSV, one Excel file (Reels, New reels, Summary), and an HTML chart.

### Snowball research

1. Open Instagram and sign in. Leave that tab open.
2. In the popup, paste 10–20 seed handles under **Snowball research**.
3. Open **Thresholds and caps** if you want to change Reels scored per account, the delay, the daily cap, the STRONG bar, the target, the depth, or the follower range. Defaults are 30 Reels, 1200 ms, 40 accounts per UTC day, 2 unpaid Reels at 3× a 10,000-view median, 20 STRONG accounts, and depth 2.
4. Choose **Run snowball**. The tab scores each account, then reads the following list and suggestions only for STRONG accounts.
5. Pause and Resume live in the same popup. A reload continues from the saved queue. A finished run downloads a CSV and an Excel file (Accounts and Queue). Sheets and Notion run only if you already turned them on.

### Account finder

1. Open a profile while signed in.
2. In the Sorter overlay, choose **Find accounts**.
3. Set how far to walk suggestions and how many following accounts to read. The same delay applies between requests.
4. Choose **Collect**. New handles are stored on this browser and labeled with a source such as `suggested from ada`.
5. Export the rows, or send them into the batch runner.

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
- Snowball research seeds 10–20 handles, grades each account STRONG, MAYBE, or WEAK from its Reels, and expands only from STRONG accounts. The queue prefers accounts mentioned by more STRONG accounts. It stops at a STRONG target, a max depth, a weak round, or the daily cap, and it resumes after a reload.
- Optional video transcription using your own Whisper-compatible provider/key.
- View related accounts suggested by Instagram from the Sorter overlay.

## Batch runner

The short version is under Quickstart. On an Instagram tab, open the extension popup and paste handles (one per line, or profile URLs). Set how many Reels to load per account (up to 200) and the delay between Instagram requests (400–10000 ms, default 1200). Run batch.

The tab visits each profile's Reels page, reads up to N Reels, and scores that account on its own median. The export is one CSV of every Reel, one Excel workbook, and an HTML summary chart. The workbook has a Reels sheet, a New reels sheet, and a Summary sheet (reels loaded, median views, top Reel, how many Reels are at 3× the account median, and how many were already seen). Each Reel row includes the caption hook: the first line that still says something after hashtags and @mentions are removed. Pause keeps the finished accounts. Resume continues at the same handle. A rate limit, including Instagram's "please wait a few minutes" response, pauses the job instead of advancing. Shortcodes already exported on this browser are marked Seen before and left off the New reels sheet, so a later run does not treat them as new discoveries. The HTML file charts median views and 3× Reels per account.

## Snowball research

The short version is under Quickstart. Paste 10–20 handles. The crawl scores one account at a time from its Reels (default 30, up to 100), then classifies it:

- **STRONG** when unpaid Reels at or above 3× that account's median views meet your count (default 2) and the median itself meets your floor (default 10,000). Leave the engagement percent blank to skip that check. A value of `1` requires a median engagement rate of at least 1%.
- **MAYBE** when the account misses STRONG but still has at least one unpaid 3× Reel and a median of at least 1,000 views.
- **WEAK** otherwise. An account that returns no Reels is recorded as an error and is not expanded.

A Reel with `#ad`, `#sponsored`, `#paidpartnership`, or Instagram's paid-partnership flag is left out of the 3× count, as is a Reel whose like rate is under 10% of the set's median while its views are at least that median.

Only STRONG accounts are expanded. The crawl reads up to 40 following accounts and up to 20 suggested accounts, waits at least 400 ms between requests (default 1200), and does not follow, like, comment, or message. Handles already seeded, queued, or scored are not added again. A candidate's priority is how many distinct STRONG accounts follow or suggest it. Optional minimum and maximum follower counts skip candidates whose count is known and outside the range; a missing count is kept.

Depth 0 is the seed list. Each expansion adds the next depth. The crawl stops when the STRONG target is reached (default 20), the depth cap is reached (default 2), or a finished depth is under the STRONG ratio (default 20%). It also pauses at the daily cap (default 40 scored accounts per UTC day) and continues when you resume on a later UTC day. Seen handles, the queue, scores, sources, and depth are stored in `chrome.storage.local`, so a reload or crash resumes the same crawl.

The export is a CSV and an Excel workbook with an Accounts sheet and a Queue sheet. Provenance reads `seed`, `followed by A, B`, or `suggested by A`. If Sheets or Notion is already enabled, the same finish step can create a Sheet or send summary rows. Notion maps `Grade` and `Provenance` only when the database has rich text properties with those names.

## Account finder

The short version is under Quickstart. On a profile, use **Find accounts**. It reads Suggested for you, optionally walks a short chain of those suggestions, scrolls an open following dialog, and pages the following list up to the cap you set. The same delay applies between requests. New handles are stored on this browser, deduped, and labeled with a source such as `suggested from ada`. Export the new rows, or send them straight into the batch runner. This does not follow, like, or message anyone.

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
