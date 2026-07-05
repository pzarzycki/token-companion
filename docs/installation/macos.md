# macOS

## Requirements

- macOS 12 Monterey or later
- Both **Apple Silicon (arm64)** and **Intel (x64)** builds are available as separate `.dmg` files

## Download

Go to the [Releases page](https://github.com/OWNER/token-companion/releases) and download the `.dmg` that matches your Mac:

| Build | File | For |
|---|---|---|
| Apple Silicon | `Token.Companion-x.x.x-arm64.dmg` | M1, M2, M3, M4 Macs |
| Intel | `Token.Companion-x.x.x-x64.dmg` | Intel Core Macs |

Not sure which you have? Click  → **About This Mac** → check **Chip**.

## Install

1. Open the downloaded `.dmg` file.
2. Drag **Token Companion** into your **Applications** folder.
3. Eject the disk image.

## First launch — Gatekeeper

Token Companion is not code-signed with an Apple Developer certificate. macOS will block it on first open with *"Token Companion cannot be opened because it is from an unidentified developer."*

There are two ways around this:

=== "Right-click (no Terminal)"

    1. Open **Finder** and navigate to **Applications**.
    2. **Right-click** (or Control-click) `Token Companion.app`.
    3. Select **Open** from the context menu.
    4. Click **Open** in the dialog that appears.

    This only needs to be done once — subsequent launches work normally.

=== "Terminal (recommended)"

    Run this command once, then launch the app normally:

    ```bash
    xattr -cr /Applications/Token\ Companion.app
    ```

    `-c` clears all extended attributes (including the quarantine flag macOS set when you downloaded the file), and `-r` recurses into the app bundle.

!!! warning "Why is the app unsigned?"
    Signing macOS apps requires an annual Apple Developer membership. Token Companion is an open-source dev tool; the full source is on [GitHub](https://github.com/OWNER/token-companion) for your review.

## Verify the install

After launch, the **Dashboard** tab appears and Token Companion begins scanning your session files. You should see a **"Scanning…"** indicator in the header within a second or two.

If the app launches but shows no data, see [Getting Started](../usage/getting-started.md).
