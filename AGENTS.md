# Agent Instructions

- Prefer simple implementations over clever abstractions.
- Never hide, swallow, obfuscate, or reword errors in a way that loses the original failure.
- Fail quickly when required inputs, state, or assumptions are invalid.
- Keep documentation and tests minimal, focused, and useful.
- Release procedure: treat `vX.Y.Z` on `main` as the only real release source of truth. Before tagging, bump the version in `package.json`, `package-lock.json`, `packages/npm-installer/package.json`, and `packages/npm-installer/package-lock.json`, then update every user-visible hardcoded release reference so it matches exactly: `README.md`, `packages/npm-installer/README.md`, `docs/src/pages/install.astro`, and any other docs or config that embed concrete asset URLs, tarball URLs, commands, or `vX.Y.Z` strings. Keep README/docs links clickable and real for the current release, not generic placeholders, then let GitHub Actions build artifacts and publish npm from the tag.
- Keep commit messages succinct.
- Do not add attribution, generated-by notes, or extra metadata to commits.
- If you have to create a new branch - use working branch names in the form `feat-<feature-name>` for features or `bug-<bug-name>` for fixes.
- Do not make branch naming more complex than needed.
