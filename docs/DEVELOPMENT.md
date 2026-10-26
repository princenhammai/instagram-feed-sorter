# Developer and maintainer notes

## Build a release ZIP

```sh
npm ci
npm run typecheck
npm test
npm run test:mcp
npm run package
```

The packager checks the production manifest, referenced entry files, version consistency and release contents. It includes install/privacy/license documentation and bundled dependency notices. ZIP entry timestamps are normalized and a SHA-256 file is produced.

Local `.codex/`, `.cursor/`, `.mcp.json`, `.env*`, build outputs and personal data are excluded from version control. Examples below use a placeholder path; no machine-specific config is required in the published source.

## Optional local agent bridge

This advanced integration is unnecessary for sorting from the extension popup.

```sh
node /absolute/path/to/instagram-feed-sorter/mcp/server.mjs --http
```

The server listens only on `127.0.0.1:47331`. A stdio MCP client can launch `node` with the absolute server path as its argument. The tools are browser status, post sorting and related profiles. Leave Chrome open and signed in during a sort.

The bridge trusts local processes and Chrome extensions; it is not a publicly authenticated gateway. Do not expose it to the internet as a shortcut for mobile use.

## Publish another version

1. Update version in `package.json`, `package-lock.json` and `manifest.json` (and the bridge version if changing it).
2. Update `RELEASE_NOTES.md`.
3. Run the checks and packaging command above.
4. Commit and tag the release, then push the branch and tag.
5. Create a GitHub Release with the ZIP and `SHA256SUMS.txt`, or run the manual **Release ZIP** workflow with that tag.

CI verifies builds/tests/packaging on Ubuntu, Windows and macOS. Those checks verify code portability, not live Instagram/browser behavior on every platform. The original popup/library were inspected in an isolated HTTP preview; a full live extension run remains a separate browser test.

## Chrome compatibility

Offscreen detection uses the native method when present, then extension contexts or service-worker clients on older versions. Chrome documents [Offscreen API availability](https://developer.chrome.com/docs/extensions/reference/api/offscreen). CDN access uses the standard `*.domain` host pattern rather than repeated host wildcards, following [Chrome match-pattern syntax](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns).
