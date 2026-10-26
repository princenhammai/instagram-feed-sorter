# Privacy and permissions

Instagram Feed Sorter has no publisher-operated backend or analytics service.

## Local data

- Saved posts, captions, metrics and any stored media are kept in IndexedDB (`ifs-library`).
- Settings, the transcription key you enter, a batch in progress, the account-finder list, and cached transcripts are kept in this browser's extension storage.
- An optional Notion integration token is kept in the same local storage and is sent only to `api.notion.com` when you turn Notion sync on. Google Sheet sync uses your existing Google session and stays off until you enable it.
- This data is not bundled in a release or synchronized by this project between devices.
- Removing an installation or changing its identity can make its local data unavailable. Download/export important files before doing so.

## Network requests

- Instagram reading uses the Instagram session in your browser and Instagram web endpoints. Media downloads request Instagram/Meta CDN URLs.
- An explicit Google Sheets export uses the signed-in Google session to create a spreadsheet. The cookies permission supports that export. The publisher does not receive your session cookies.
- Explicit transcription sends the selected audio/video to the endpoint you configure with your key. The default is OpenAI's API; you can configure a compatible endpoint. Provider data policies and charges apply.
- The optional agent bridge connects to `127.0.0.1:47331` on your own device. Basic extension operation does not require that service.

## Declared permissions

| Permission / host access | Purpose |
| --- | --- |
| storage | Settings, local cache and job/session state |
| downloads | Save media, ZIP files and exported tables |
| scripting | Run the Instagram page-world reader |
| offscreen | Prepare file exports/downloads outside the service worker |
| cookies and docs.google.com | Explicit Google Sheets export through your own Google session |
| alarms and loopback host | Keep the optional local agent bridge available |
| Instagram and its CDNs | Read the page and retrieve selected media |
| api.openai.com | Optional transcription |
| Optional HTTPS/localhost hosts | A custom transcription endpoint, or api.notion.com when you enable Notion sync |

The extension does not ask for your Instagram password and does not like, follow, comment or publish Instagram posts. Share bug reports without cookies, passwords, API keys or private saved media.
