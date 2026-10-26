# Instagram Feed Sorter v0.4.6

Batch and snowball keep the reels from the first response, scroll the last reel tile into view, and wait for the next page before counting a round as quiet. Ten quiet rounds, or a time limit of 90 seconds or 3 seconds per target reel (at most 5 minutes), end an account. The request log includes the pages fetched. Snowball scores every seed and keyword account, then expands STRONG accounts up to Max to expand and through max depth. The daily cap is the total scored-account limit. Still read-only. No new paid service and no Instagram writes.

## Install the extension

Download **instagram-feed-sorter-v0.4.6.zip** and **SHA256SUMS.txt**. From the folder that contains both, run `sha256sum -c SHA256SUMS.txt`. Extract the extension zip, then use Developer mode → Load unpacked in desktop Chrome or Edge. Select the folder that contains `manifest.json`. The manifest version is **0.4.6**. Sign in to Instagram yourself and open a profile's Reels tab. Reload the extension after replacing an older unpacked folder, then refresh Instagram.

No Node.js, API key, or server is needed for sorting, batching, snowball research, or file export. This is a desktop Chromium build.

## Install the video breakdown CLI

Download **instagram-feed-sorter-breakdown-v0.4.6.zip**. It contains `breakdown.py`, `requirements.txt`, and `INSTALL.md`. ffmpeg and ffprobe are required. tesseract and faster-whisper are optional and free. Follow `INSTALL.md` inside the zip. This script is experimental.

## Quickstart

- **Research panel.** On an Instagram tab, choose Research. Paste handles. Snowball also has a Keywords field, plus Max to expand (20) and Max depth (2). Max to expand is how many STRONG accounts are opened after the seeds and keyword accounts are scored. Set Reels per account (100 for batch, 30 for snowball). That count stays after Run, and the number fields accept digits only. Run Batch or Snowball. Keyword accounts are listed under the progress line. The results table sorts by × median, engagement, or views, and hides paid reels until you show them. Snowball rows show provenance such as `search: keyword`. Export, Download top 10, and Sync are one click. Resume stays on the panel.
- **Request log.** Each account line shows the HTTP status, URL, reel count, and pages fetched, for example `30 reels read from the page grid (4 pages)`. A skip names the time limit when the account did not finish.
- **Batch runner.** Each account scrolls the last reel into view and waits for the next network response. The account ends at the target, after ten quiet rounds, or at the scaled time limit. If every account comes back empty, the batch stays paused and does not save an empty export.
- **Account finder.** On a profile or Reels tab, Find accounts stays on the right.
- **Sheets and Notion.** Options page. Both stay off until you enable them. Notion uses a token stored only in this browser.
- **Video breakdown.** Download top N, then `python3 breakdown.py "rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny`.

## Included

- The grid capture scrolls the last reel link into view and the window to the bottom. A round waits 2.5 seconds and stays open while a data request is in flight. Ten rounds with no new reels end the account.
- The per-account limit is 90 seconds, or 3 seconds for each target reel, and at most 5 minutes. The request log records pages fetched.
- Max to expand no longer finishes a snowball when that many STRONG accounts have been scored. Depth 0 is scored, then STRONG accounts are expanded until that cap or max depth. The daily cap still limits how many accounts are scored.
- v0.4.5, below, is included.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram. Check `SHA256SUMS.txt` against every asset on this release. A folder that still says manifest 0.4.5 is an older build.

# Instagram Feed Sorter v0.4.5

Batch and snowball use the v0.3.2 Sort capture again: the window scroll, the same waits, and the reels already returned with the first response. A profile that is still short after 90 seconds is skipped and the batch continues. Keyword handles from the search results are listed on the panel and in the request log. Sidebar and suggested accounts are not treated as search hits. Still read-only. No new paid service and no Instagram writes.

## Install the extension

Download **instagram-feed-sorter-v0.4.5.zip** and **SHA256SUMS.txt**. From the folder that contains both, run `sha256sum -c SHA256SUMS.txt`. Extract the extension zip, then use Developer mode → Load unpacked in desktop Chrome or Edge. Select the folder that contains `manifest.json`. The manifest version is **0.4.5**. Sign in to Instagram yourself and open a profile's Reels tab. Reload the extension after replacing an older unpacked folder, then refresh Instagram.

No Node.js, API key, or server is needed for sorting, batching, snowball research, or file export. This is a desktop Chromium build.

## Install the video breakdown CLI

Download **instagram-feed-sorter-breakdown-v0.4.5.zip**. It contains `breakdown.py`, `requirements.txt`, and `INSTALL.md`. ffmpeg and ffprobe are required. tesseract and faster-whisper are optional and free. Follow `INSTALL.md` inside the zip. This script is experimental.

## Quickstart

- **Research panel.** On an Instagram tab, choose Research. Paste handles. Snowball also has a Keywords field, plus Max accounts (20) and Max depth (2). Set Reels per account (100 for batch, 30 for snowball). That count stays after Run, and the number fields accept digits only. Run Batch or Snowball. Keyword accounts are listed under the progress line. The results table sorts by × median, engagement, or views, and hides paid reels until you show them. Snowball rows show provenance such as `search: keyword`. Export, Download top 10, and Sync are one click. Resume stays on the panel.
- **Request log.** Each account line shows the HTTP status, URL, and how many reels were captured. A skip says `Timed out after 90s` when the account did not finish. A keyword line lists the handles, for example `4 accounts: @magic.mike, @ada`.
- **Batch runner.** Each account uses Sort's window scroll. Reels from the first response stay, then scrolling adds more. The account ends at the target, after six quiet rounds, or at 90 seconds. If every account comes back empty, the batch stays paused and does not save an empty export.
- **Account finder.** On a profile or Reels tab, Find accounts stays on the right.
- **Sheets and Notion.** Options page. Both stay off until you enable them. Notion uses a token stored only in this browser.
- **Video breakdown.** Download top N, then `python3 breakdown.py "rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny`.

## Included

- Batch, snowball, and Sort share one capture loop: read the network capture, scroll the window by the v0.3.2 nudge, wait 700ms after a new page and 1000ms when nothing new arrived, and stop after six quiet rounds. A later empty read does not erase reels already captured.
- Each batch or snowball account stops after 90 seconds. The request log records the skip, and the run continues with the next account.
- Keyword search keeps accounts linked in the results column. Suggested, following, and sidebar accounts are excluded. The handles are shown on the panel and in the request log.
- Progress repaints when the reel count changes, and at most about once a second, so typing in the panel stays in the field you clicked.
- A fixture test replays a 5-reel page, then a longer page after the scroll nudge, and checks the first page is not dropped when a later read comes back empty.
- v0.4.4, below, is included.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram. Check `SHA256SUMS.txt` against every asset on this release. A folder that still says manifest 0.4.4 is an older build.

# Instagram Feed Sorter v0.4.4

Batch and snowball keep scrolling each profile's Reels grid until the target count arrives or new scrolls stop adding reels. Keyword lookup opens Instagram's search page and reads the accounts that page loads. Snowball shows Max accounts and Max depth. Still read-only. No new paid service and no Instagram writes.

## Install the extension

Download **instagram-feed-sorter-v0.4.4.zip** and **SHA256SUMS.txt**. From the folder that contains both, run `sha256sum -c SHA256SUMS.txt`. Extract the extension zip, then use Developer mode → Load unpacked in desktop Chrome or Edge. Select the folder that contains `manifest.json`. The manifest version is **0.4.4**. Sign in to Instagram yourself and open a profile's Reels tab. Reload the extension after replacing an older unpacked folder, then refresh Instagram.

No Node.js, API key, or server is needed for sorting, batching, snowball research, or file export. This is a desktop Chromium build.

## Install the video breakdown CLI

Download **instagram-feed-sorter-breakdown-v0.4.4.zip**. It contains `breakdown.py`, `requirements.txt`, and `INSTALL.md`. ffmpeg and ffprobe are required. tesseract and faster-whisper are optional and free. Follow `INSTALL.md` inside the zip. This script is experimental.

## Quickstart

- **Research panel.** On an Instagram tab, choose Research. Paste handles. Snowball also has a Keywords field, plus Max accounts (20) and Max depth (2). Set Reels per account (100 for batch, 30 for snowball). That count stays after Run, and the number fields accept digits only. Run Batch or Snowball. The results table sorts by × median, engagement, or views, and hides paid reels until you show them. Snowball rows show provenance such as `search: keyword`. Export, Download top 10, and Sync are one click. Resume stays on the panel.
- **Request log.** Each Instagram request is listed with its HTTP status, URL, and response snippet. Grid reads and search-page reads are listed too.
- **Batch runner.** Each account is read by scrolling its Reels grid and waiting for new reels. If every account comes back empty, the batch stays paused and does not save an empty export.
- **Account finder.** On a profile or Reels tab, Find accounts stays on the right.
- **Sheets and Notion.** Options page. Both stay off until you enable them. Notion uses a token stored only in this browser.
- **Video breakdown.** Download top N, then `python3 breakdown.py "rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny`.

## Included

- The Reels grid scroller moves the profile's own scroll container, waits for newly captured reels, and stops after six scrolls with no new items or when the target is reached. Sort uses the same scroll.
- Keyword search opens `/explore/search/keyword/?q=` and reads accounts from that page and from the GraphQL response Instagram fires there.
- Reels per account, Max accounts, and Max depth reject letters, so a stray key cannot turn 30 into `e30`. Typing in Seed handles stays in that box.
- A sample reel with `#ad` and a paid-partnership flag is covered by the unit tests.
- v0.4.3, below, is included.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram. Check `SHA256SUMS.txt` against every asset on this release. A folder that still says manifest 0.4.3 is an older build.

# Instagram Feed Sorter v0.4.3

Batch and snowball now read each account by scrolling that profile's Reels grid, the same capture Sort uses. Keyword search uses the signed-in web search at `/web/search/topsearch/`. A batch that finds no reels stays paused instead of exporting an empty file. Still read-only. No new paid service and no Instagram writes.

## Install the extension

Download **instagram-feed-sorter-v0.4.3.zip** and **SHA256SUMS.txt**. From the folder that contains both, run `sha256sum -c SHA256SUMS.txt`. Extract the extension zip, then use Developer mode → Load unpacked in desktop Chrome or Edge. Select the folder that contains `manifest.json`. The manifest version is **0.4.3**. Sign in to Instagram yourself and open a profile's Reels tab. Reload the extension after replacing an older unpacked folder, then refresh Instagram.

No Node.js, API key, or server is needed for sorting, batching, snowball research, or file export. This is a desktop Chromium build.

## Install the video breakdown CLI

Download **instagram-feed-sorter-breakdown-v0.4.3.zip**. It contains `breakdown.py`, `requirements.txt`, and `INSTALL.md`. ffmpeg and ffprobe are required. tesseract and faster-whisper are optional and free. Follow `INSTALL.md` inside the zip. This script is experimental.

## Quickstart

- **Research panel.** On an Instagram tab, choose Research. Paste handles. Snowball also has a Keywords field. Set Reels per account (100 for batch, 30 for snowball). That count stays after Run. Run Batch or Snowball. The results table sorts by × median, engagement, or views, and hides paid reels until you show them. Snowball rows show provenance such as `search: keyword`. Export, Download top 10, and Sync are one click. Resume stays on the panel.
- **Request log.** Each Instagram request is listed with its HTTP status, URL, and response snippet. Grid reads are listed too. The run pauses for rate limiting only on HTTP 429 or a body that contains `feedback_required`.
- **Batch runner.** Each account is read by scrolling its Reels grid. If every account comes back empty, the batch stays paused and does not save an empty export.
- **Account finder.** On a profile or Reels tab, Find accounts stays on the right. Profile id lookups prefer the id already on the page and slow down after HTTP 429.
- **Sheets and Notion.** Options page. Both stay off until you enable them. Notion uses a token stored only in this browser.
- **Video breakdown.** Download top N, then `python3 breakdown.py "rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny`.

## Included

- Reel loading for batch and snowball follows the in-page grid Sort already uses. Direct clips and feed calls that return HTML are not treated as a finished account.
- Keyword search calls `https://www.instagram.com/web/search/topsearch/` from the page, with the web app headers (`X-IG-App-ID`, `X-CSRFToken`, `X-Requested-With`, `X-ASBD-ID`).
- Clicking Keywords or Reels per account keeps the following keystrokes in that field. The Reels-per-account value is saved with the handles and restored after Run reloads the tab.
- `web_profile_info` is skipped when the open page already has the account id, spaced 1.2 seconds apart, and backed off 15 seconds after HTTP 429.
- Packaging fails if the built zip is missing `Find accounts`, `Keywords`, `search: keyword`, `Reels per account`, or `Request log`.
- v0.4.2, below, is included.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram. Check `SHA256SUMS.txt` against every asset on this release. A folder that still says manifest 0.4.2 is an older build.

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
