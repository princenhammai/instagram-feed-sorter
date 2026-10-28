# Install Instagram Feed Sorter

## Desktop Chrome

1. Download the named `instagram-feed-sorter-v<VERSION>.zip` from [GitHub Releases](https://github.com/princenhammai/instagram-feed-sorter/releases/latest).
2. Extract all files into a permanent folder. `manifest.json` must be directly inside the folder you select.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder.
6. Pin the extension from the browser's puzzle-piece Extensions menu.
7. Open `https://www.instagram.com/` and sign in yourself.
8. Open an account's **Reels** tab, click the extension and choose **Views** to sort a small batch first.

The ZIP contains the compiled extension. No npm, Node.js, API key or running server is required for basic sorting.

## Desktop Edge

Use `edge://extensions`, turn on Developer mode and select Load unpacked. The same ZIP targets Chromium, but Edge has not been independently browser-tested for every feature.

## Mobile and other browsers

This release is a desktop Chromium extension. Chrome mobile, the Instagram mobile app, Safari and Firefox are not supported. Installing from GitHub does not add extension APIs to an unsupported browser.

## First use

- Start with 25 or 50 Reels. Keep Instagram open while collection runs.
- Click Stop if you have enough posts, then inspect the collected results.
- Use Export for CSV/JSON/Excel/Sheets or Save to keep posts in local folders.
- Open Your library from the popup to find saved posts.
- Transcription is optional and needs your own configured provider/API key.

## Test CSV export in v0.3.3

Refresh Instagram after updating, sort a small batch on a profile's Reels tab, then choose **Export data → CSV**. The file is saved to your browser's default downloads folder as `ifs-<username>-YYYY-MM-DD.csv`, without a separate save dialog. Check the browser's Downloads page if you cannot find it. JSON uses the same download path. Chrome must return a download ID before the extension reports success.

## Updating

Replace the files inside the same loaded folder, click Reload in Extensions, then refresh Instagram. Keep the existing installation and folder path if you want to preserve local data.

## Troubleshooting

- **“Manifest file is missing”**: extract the ZIP and select the folder directly containing `manifest.json`. Do not load the ZIP itself or a parent folder.
- **TypeScript files or no build assets**: you downloaded GitHub's Source code ZIP. Use the named extension ZIP instead, or build the source with `npm ci` and `npm run build`.
- **Popup says refresh Instagram**: reload the extension and refresh the Instagram tab.
- **No results / login required**: sign in to Instagram yourself and retry on a profile or Reels tab.
- **Rate limiting**: stop, wait, then try a smaller batch. The extension cannot guarantee every Instagram endpoint remains available.
- **Missing library on a second device**: libraries are local; they do not sync automatically.
- **Managed work/school browser**: your organization may restrict unpacked extensions.

Official installation reference: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked
