# Agent Instructions

- Prefer simple implementations over clever abstractions.
- Never hide, swallow, obfuscate, or reword errors in a way that loses the original failure.
- Fail quickly when required inputs, state, or assumptions are invalid.
- Keep documentation and tests minimal, focused, and useful.
- When cutting a release, update all user-visible version references and keep `package.json`, `package-lock.json`, `packages/npm-installer/package.json`, and `packages/npm-installer/package-lock.json` aligned.
- Keep commit messages succinct.
- Do not add attribution, generated-by notes, or extra metadata to commits.
- If you have to create a new branch - use working branch names in the form `feat-<feature-name>` for features or `bug-<bug-name>` for fixes.
- Do not make branch naming more complex than needed.
