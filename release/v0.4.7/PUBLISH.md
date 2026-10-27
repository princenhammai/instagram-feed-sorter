# Publish v0.4.7

The pull request stays open for review. Do not merge it to `main` as part of this publish step. This branch stacks on `cursor/batch-research-0ad6`.

This folder is the release payload, built after the tests passed:

- `instagram-feed-sorter-v0.4.7.zip` — unpacked extension, manifest 0.4.7
- `instagram-feed-sorter-breakdown-v0.4.7.zip` — `breakdown.py`, `requirements.txt`, and `INSTALL.md`
- `SHA256SUMS.txt` — SHA-256 for the two zips and `RELEASE_NOTES.md`
- `RELEASE_NOTES.md` — GitHub release body
- `TAG_MESSAGE.md` — annotated tag message

`sha256sum -c SHA256SUMS.txt` in this folder checks the three hashed files.

Extension zip SHA-256: `ef1b1358c0828e2b648730101ef35bf3e36995f68dde21bbcfbcb96d6a86f569`

## Tag, when the owner wants a GitHub release

```sh
git tag -a v0.4.7 <commit> -F release/v0.4.7/TAG_MESSAGE.md
git push origin v0.4.7
gh workflow run "Release ZIP" --ref v0.4.7 -f tag=v0.4.7
```

Dispatching `--ref v0.4.7` works once that tag points at a commit that contains `.github/workflows/release.yml`. The job rebuilds on GitHub and creates the release. It does not merge the pull request.

```sh
gh release create v0.4.7 \
  release/v0.4.7/instagram-feed-sorter-v0.4.7.zip \
  release/v0.4.7/instagram-feed-sorter-breakdown-v0.4.7.zip \
  release/v0.4.7/SHA256SUMS.txt \
  release/v0.4.7/RELEASE_NOTES.md \
  --title "Instagram Feed Sorter v0.4.7" \
  --notes-file release/v0.4.7/RELEASE_NOTES.md
```
