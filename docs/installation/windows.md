# Windows

!!! warning "Coming soon"
    A Windows build has not yet been published to the Releases page. You can watch the [build workflow](https://github.com/OWNER/token-companion/actions/workflows/build.yml) for status, or [build from source](#build-from-source) in the meantime.

## Requirements

- Windows 10 64-bit or later

## Download

Go to the [Releases page](https://github.com/OWNER/token-companion/releases) and download the `.exe` NSIS installer.

## Install

1. Run the downloaded `.exe`.
2. **Windows protected your PC** (SmartScreen) will appear because the installer is unsigned.

    - Click **More info** (the link, not a button).
    - Click **Run anyway**.

3. Follow the installer: choose an install location → **Install** → **Finish**.
4. Launch Token Companion from the Start Menu or the Desktop shortcut.

!!! note "Why does SmartScreen appear?"
    Windows SmartScreen flags installers from publishers that don't yet have an established reputation. As more users install Token Companion, the warning will become less common. The full source is on [GitHub](https://github.com/OWNER/token-companion) if you'd like to audit it before running.

## Build from source

If a pre-built installer is not yet available, you can build locally:

**Prerequisites:**

- [Node.js 20+](https://nodejs.org/)
- Visual Studio Build Tools with the **Desktop development with C++** workload (required to compile the `classic-level` native module)

```powershell
git clone https://github.com/OWNER/token-companion.git
cd token-companion
npm install
npm run build:win
```

The installer is written to `dist/`.

## Verify the install

After launch, the **Dashboard** tab appears and Token Companion begins scanning `%USERPROFILE%\.claude\projects` and `%USERPROFILE%\.codex\sessions`. You should see a **"Scanning…"** indicator within a second or two.

If the app launches but shows no data, see [Getting Started](../usage/getting-started.md).
