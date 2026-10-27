# Publish v0.4.1

The pull request stays open for review. Do not merge it to `main` as part of this publish step. This branch stacks on `cursor/batch-research-0ad6`.

This folder is the release payload, built after the tests passed:

- `instagram-feed-sorter-v0.4.1.zip` — unpacked extension
- `instagram-feed-sorter-breakdown-v0.4.1.zip` — `breakdown.py`, `requirements.txt`, and `INSTALL.md`
- `SHA256SUMS.txt` — SHA-256 for the two zips and `RELEASE_NOTES.md`
- `RELEASE_NOTES.md` — GitHub release body
- `TAG_MESSAGE.md` — annotated tag message

`sha256sum -c SHA256SUMS.txt` in this folder checks the three hashed files.

## What is already done

- Tests: `npm test` (87), `npx tsc --noEmit`, `npm run test:mcp` (5).
- `npm run package` wrote the same bytes that are copied here.
- `.github/workflows/release.yml` publishes `artifacts/*.zip`, `artifacts/SHA256SUMS.txt`, and `artifacts/RELEASE_NOTES.md` when it is dispatched against an existing annotated tag. The workflow checks the tag out, rebuilds, and runs `gh release create`.

## What remains

Run these from a checkout of the commit that contains this folder. The tag has to be annotated. `--verify-tag` rejects a lightweight tag.

```sh
git tag -a v0.4.1 <commit> -F release/v0.4.1/TAG_MESSAGE.md
git push origin v0.4.1
gh workflow run "Release ZIP" --ref v0.4.1 -f tag=v0.4.1
```

The workflow file is on this branch. Dispatching `--ref v0.4.1` works once that tag points at a commit that contains `.github/workflows/release.yml`. The job then builds on GitHub and creates the release **Instagram Feed Sorter v0.4.1**. It does not merge the pull request.

Until that workflow finishes, the assets in this folder are the files to attach by hand:

```sh
gh release create v0.4.1 \
  release/v0.4.1/instagram-feed-sorter-v0.4.1.zip \
  release/v0.4.1/instagram-feed-sorter-breakdown-v0.4.1.zip \
  release/v0.4.1/SHA256SUMS.txt \
  release/v0.4.1/RELEASE_NOTES.md \
  --verify-tag \
  --title "Instagram Feed Sorter v0.4.1" \
  --notes-file release/v0.4.1/RELEASE_NOTES.md
```

Use the hand upload only if the Release ZIP workflow cannot be dispatched. The workflow rebuilds the zips on GitHub so the published bytes come from the tagged source.
