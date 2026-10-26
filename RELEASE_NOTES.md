# Instagram Feed Sorter v0.4.0

Batch research across accounts, still read-only.

- Paste handles and the open Instagram tab visits each Reels page, loads up to 200 Reels, and waits a configurable delay between requests. One CSV and one Excel file include an account column, per-account median, × median, engagement, and the paid-post flag. The workbook adds a summary sheet. Pause and resume keep finished accounts.
- Find accounts on a profile from suggestions and the following list, skip handles already saved, and export them or start a batch.
- Google Sheets and Notion sync are off until you enable them in options. Notion uses a token stored only in this browser.
- Download top N names files `rankNN_<handle>_<shortcode>.mp4`. `tools/breakdown.py` makes a local contact sheet, scene cuts, and optional offline transcript and OCR.
- v0.3.3, below, is included: exports wait until Chrome finishes the file.

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
