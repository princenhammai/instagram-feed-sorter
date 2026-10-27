# Instagram Feed Sorter v0.4.2

The research panel now matches the single-profile Reels loader, and the packaged zip is checked for the Snowball and account-finder controls. Still read-only. No new paid service and no Instagram writes.

## Install the extension

Download **instagram-feed-sorter-v0.4.2.zip** and **SHA256SUMS.txt**. From the folder that contains both, run `sha256sum -c SHA256SUMS.txt`. Extract the extension zip, then use Developer mode → Load unpacked in desktop Chrome or Edge. Select the folder that contains `manifest.json`. The manifest version is **0.4.2**. Sign in to Instagram yourself and open a profile's Reels tab. Reload the extension after replacing an older unpacked folder, then refresh Instagram.

No Node.js, API key, or server is needed for sorting, batching, snowball research, or file export. This is a desktop Chromium build.

## Install the video breakdown CLI

Download **instagram-feed-sorter-breakdown-v0.4.2.zip**. It contains `breakdown.py`, `requirements.txt`, and `INSTALL.md`. ffmpeg and ffprobe are required. tesseract and faster-whisper are optional and free. Follow `INSTALL.md` inside the zip. This script is experimental.

## Quickstart

- **Research panel.** On an Instagram tab, choose Research. Paste handles. Snowball also has a Keywords field. Set Reels per account (100 for batch, 30 for snowball). Run Batch or Snowball. The results table sorts by × median, engagement, or views, and hides paid reels until you show them. Snowball rows show provenance such as `search: keyword`. Export, Download top 10, and Sync are one click. Resume stays on the panel.
- **Request log.** Each Instagram request is listed with its HTTP status, URL, and response snippet. The run pauses only for HTTP 429 or a body that contains `feedback_required`. "Please wait" text alone does not pause it.
- **Batch runner.** Each account uses the same Reels loader as Sort on one profile, including the feed fallback when the first clips page fails. The download is one CSV, one Excel workbook, and an HTML chart.
- **Account finder.** On a profile or Reels tab, Find accounts stays on the right, including while another panel is open. Suggestions and errors stay in that panel.
- **Sheets and Notion.** Options page. Both stay off until you enable them. Notion uses a token stored only in this browser.
- **Video breakdown.** Download top N, then `python3 breakdown.py "rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny`.

## Included

- Keystrokes in the research panel and the account finder stay in those fields. Instagram does not receive them, so a shortcut cannot move focus or open Instagram's feedback dialog.
- Show paid sits in the results row instead of over the panel title.
- Packaging fails if the built zip is missing `Find accounts`, `Keywords`, `search: keyword`, `Reels per account`, or `Request log`.
- Snowball still searches up to 10 keywords and 15 accounts each, then scores and expands like any other candidate. Provenance `search: <keyword>` is stored, exported, and shown on the result row.
- v0.3.3, below, is included: exports wait until Chrome finishes the file.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram. Check `SHA256SUMS.txt` against every asset on this release. A folder that still says manifest 0.4.1 is an older build.

# Instagram Feed Sorter v0.3.3

Research sorting for a loaded set of Reels: compare each video with the median, separate like and comment rates, and set aside likely-paid posts before they skew a ranking.

## Install

Download **instagram-feed-sorter-v0.3.3.zip**, extract it, then use Developer mode → Load unpacked in desktop Chrome or Chromium. Select the folder containing `manifest.json`. Sign in to Instagram yourself and open a profile's Reels tab.

No Node.js, API key or server is needed for sorting, scoring, or file export. Optional transcription still uses your own provider/key. This is a desktop Chromium build.

## Included

- CSV, JSON and Excel exports now wait until Chrome finishes writing the file. If the save fails, the toast shows the reason instead of saying the rows were exported. The file lands in your downloads folder, under `Instagram Feed Sorter` when that folder can be created.
- Views × median, likes/views and comments/views are on each card, in the player, in the sort menu, and in clipboard, CSV and Excel exports. Duration, engagement rate and outlier score stay one column each. Duration is sortable alongside engagement rate and outlier score.
- Likely-paid posts are marked from `#ad`, `#sponsored`, `#paidpartnership`, Instagram's paid-partnership field, or a like rate below 10% of the set median on a post that already has at least the median number of views. Hide likely paid removes them from the grid, exports and the top-N download.
- Audio or song name and video duration are kept when the page data includes them.
- Download top N saves the current sort as `rank01_<shortcode>.mp4`, `rank02_<shortcode>.mp4`, and so on, without a save dialog for each file.
- The optional `http://127.0.0.1/*` permission is no longer requested twice. Loopback access for the local agent bridge stays a required permission.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram.
