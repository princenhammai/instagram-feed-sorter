# Instagram Feed Sorter v0.4.1

Snowball research crawls outward from seed accounts, still read-only. No new paid service and no Instagram writes.

## Install the extension

Download **instagram-feed-sorter-v0.4.1.zip** and **SHA256SUMS.txt**. From the folder that contains both, run `sha256sum -c SHA256SUMS.txt`. Extract the extension zip, then use Developer mode → Load unpacked in desktop Chrome or Edge. Select the folder that contains `manifest.json`. Sign in to Instagram yourself and open a profile's Reels tab.

No Node.js, API key, or server is needed for sorting, batching, snowball research, or file export. This is a desktop Chromium build.

## Install the video breakdown CLI

Download **instagram-feed-sorter-breakdown-v0.4.1.zip**. It contains `breakdown.py`, `requirements.txt`, and `INSTALL.md`. ffmpeg and ffprobe are required. tesseract and faster-whisper are optional and free. Follow `INSTALL.md` inside the zip. This script is experimental.

## Quickstart

- **Snowball research.** Popup → paste 10–20 handles → Run snowball. It scores Reels, marks STRONG / MAYBE / WEAK, and expands only STRONG accounts. Pause, Resume, and a reload keep the queue. The download is a CSV and an Excel file with provenance such as `followed by A, B`.
- **Batch runner.** Popup → paste handles → set the Reel count and delay → Run batch. Pause and Resume stay in the popup. The download is one CSV, one Excel workbook, and an HTML chart.
- **Account finder.** On a profile, Find accounts. Export the new handles or send them into the batch.
- **Sheets and Notion.** Options page. Both stay off until you enable them. Notion uses a token stored only in this browser.
- **Video breakdown.** Download top N, then `python3 breakdown.py "rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny`.

## Included

- Snowball research chains the batch scorer and the account finder. Seeds are scored from a configurable number of Reels. STRONG requires a configurable count of unpaid Reels at 3× the account median and a minimum median view count. Expansion reads a capped following list plus suggestions, skips anything already seen, and ranks the queue by how many distinct STRONG accounts mention it. The crawl stops at a STRONG target, a max depth, or a round under the STRONG ratio, and it pauses at a daily cap. State (seen, queue, scores, sources, depth) survives a reload. CSV and Excel include provenance. Sheets and Notion stay optional.
- Paste handles and the open Instagram tab visits each Reels page, loads up to 200 Reels, and waits a configurable delay between requests. One CSV, one Excel file, and an HTML chart include an account column, per-account median, × median, engagement, the paid-post flag, and the caption hook. The workbook adds a summary sheet and a sheet of Reels not seen on an earlier run. A rate limit pauses on the same account. Pause and resume keep finished accounts.
- Find accounts on a profile from suggestions and the following list, skip handles already saved, and export them or start a batch.
- Google Sheets and Notion sync are off until you enable them in options. Notion uses a token stored only in this browser.
- Download top N names files `rankNN_<handle>_<shortcode>.mp4`. The breakdown zip makes a local contact sheet, scene cuts, an offline transcript, and OCR of on-screen text.
- v0.3.3, below, is included: exports wait until Chrome finishes the file.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram. Check `SHA256SUMS.txt` against every asset on this release.

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
