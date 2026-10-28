# Instagram Feed Sorter v0.3.3

Fixes CSV and JSON exports that reported success without saving a file. Includes the full Instagram Reel/Post Sorter, player, local library, downloads and optional transcription.

## Install

Download **instagram-feed-sorter-v0.3.3.zip** from the release Assets, extract it, then use Developer mode → Load unpacked in desktop Chrome. Select the folder containing `manifest.json`. Sign in to Instagram yourself and open a profile's Reels tab. The ZIP is ready to use; GitHub's Source code archives require building.

No Node.js, API key or server is needed for basic sorting. Optional transcription uses your own provider/key. This is a desktop Chromium build; mobile Chrome, the Instagram app, Safari and Firefox are not supported.

## Included

- Export data → CSV and JSON now start a download through Chrome's background downloads API. Success is shown after Chrome returns a download ID; download errors are reported.
- Files use names such as `ifs-<username>-YYYY-MM-DD.csv` and are saved to the browser's default downloads folder without a separate save dialog.
- Data exports keep the current sort order and include rank, username, shortcode, URL, views, likes, comments, outlier score, ISO date, duration, caption and video URL.
- Export CSV, Excel, JSON and Copy table use the Reels already captured and sorted. These exports make no new Instagram requests. Include ads is off by default for this captured-Reels export.
- No new extension permissions. Sorting, scoring and individual media downloads retain their existing behavior.

## Verify the update

Refresh Instagram, sort a small batch on a profile's Reels tab, then choose Export data → CSV. Check the browser's Downloads page for `ifs-<username>-YYYY-MM-DD.csv` and confirm the rows match the sorted results.

Automated validation: 60 unit tests, five bridge tests, TypeScript checking and production packaging passed. Chrome on macOS loaded v0.3.3 in place with the existing extension ID. A live Instagram export has not been verified for this release.

For updates, replace files in the same loaded folder, reload the extension, then refresh Instagram. Existing local libraries do not automatically sync to other devices.
