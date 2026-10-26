# Publish v0.4.3

The pull request stays open for review. Do not merge it to `main` as part of this publish step. This branch stacks on `cursor/batch-research-0ad6`.

This folder is the release payload, built after the tests passed:

- `instagram-feed-sorter-v0.4.3.zip` — unpacked extension, manifest 0.4.3
- `instagram-feed-sorter-breakdown-v0.4.3.zip` — `breakdown.py`, `requirements.txt`, and `INSTALL.md`
- `SHA256SUMS.txt` — SHA-256 for the two zips and `RELEASE_NOTES.md`
- `RELEASE_NOTES.md` — GitHub release body
- `TAG_MESSAGE.md` — annotated tag message

`sha256sum -c SHA256SUMS.txt` in this folder checks the three hashed files.

## Tag, when the owner wants a GitHub release

```sh
git tag -a v0.4.3 <commit> -F release/v0.4.3/TAG_MESSAGE.md
git push origin v0.4.3
gh workflow run "Release ZIP" --ref v0.4.3 -f tag=v0.4.3
```

Dispatching `--ref v0.4.3` works once that tag points at a commit that contains `.github/workflows/release.yml`. The job rebuilds on GitHub and creates the release. It does not merge the pull request.

```sh
gh release create v0.4.3 \
  release/v0.4.3/instagram-feed-sorter-v0.4.3.zip \
  release/v0.4.3/instagram-feed-sorter-breakdown-v0.4.3.zip \
  release/v0.4.3/SHA256SUMS.txt \
  release/v0.4.3/RELEASE_NOTES.md \
  --title "Instagram Feed Sorter v0.4.3" \
  --notes-file release/v0.4.3/RELEASE_NOTES.md
```
