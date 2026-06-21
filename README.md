# Parro Tampermonkey Script

Parro uses Flutter Web, which renders text in a way that can break built-in browser translation and accessibility features. Browser translation has been a known Flutter Web problem for years; Flutter issue [#131984](https://github.com/flutter/flutter/issues/131984), opened on August 5, 2023, is still open.

This userscript extracts Parro news content into normal HTML and adds inline translation, making news readable in different language without relying on the browser's page translation.

Install the latest released userscript from:

https://github.com/librarian/tampermonkey_parro/releases/latest/download/parro.user.js

Tampermonkey will use the script metadata `@updateURL` and `@downloadURL` to check for updates from the latest GitHub release asset.

## Example

The userscript shows a normal HTML overlay with copy and translation controls. This anonymized screenshot has all message text and photos blurred.

![Anonymized Parro userscript example](docs/example.png)

## Release

Run the **Release userscript** workflow from the GitHub Actions tab.

The workflow automatically:

1. Reads `@version` from `parro.user.js`.
2. Increments the minor version, for example `0.6` to `0.7` or `1.2.3` to `1.3.0`.
3. Commits the version bump.
4. Creates and pushes the matching version tag, for example `v0.7`.
5. Creates a GitHub Release and uploads `parro.user.js` as the release asset.
