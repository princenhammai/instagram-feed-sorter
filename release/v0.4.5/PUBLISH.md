# Publish v0.4.5

The pull request stays open for review. Do not merge it to `main` as part of this publish step. This branch stacks on `cursor/batch-research-0ad6`.

This folder is the release payload, built after the tests passed:

- `instagram-feed-sorter-v0.4.5.zip` — unpacked extension, manifest 0.4.5
- `instagram-feed-sorter-breakdown-v0.4.5.zip` — `breakdown.py`, `requirements.txt`, and `INSTALL.md`
- `SHA256SUMS.txt` — SHA-256 for the two zips and `RELEASE_NOTES.md`
- `RELEASE_NOTES.md` — GitHub release body
- `TAG_MESSAGE.md` — annotated tag message

`sha256sum -c SHA256SUMS.txt` in this folder checks the three hashed files.

Extension zip SHA-256: `997abd40b2d14b82afb4ffb098afc5b06a87013012c346b7b9d61251245e85a1`

## Tag, when the owner wants a GitHub release

```sh
git tag -a v0.4.5 <commit> -F release/v0.4.5/TAG_MESSAGE.md
git push origin v0.4.5
gh workflow run "Release ZIP" --ref v0.4.5 -f tag=v0.4.5
```

Dispatching `--ref v0.4.5` works once that tag points at a commit that contains `.github/workflows/release.yml`. The job rebuilds on GitHub and creates the release. It does not merge the pull request.

```sh
gh release create v0.4.5 \
  release/v0.4.5/instagram-feed-sorter-v0.4.5.zip \
  release/v0.4.5/instagram-feed-sorter-breakdown-v0.4.5.zip \
  release/v0.4.5/SHA256SUMS.txt \
  release/v0.4.5/RELEASE_NOTES.md \
  --title "Instagram Feed Sorter v0.4.5" \
  --notes-file release/v0.4.5/RELEASE_NOTES.md
```
