# Linux

!!! warning "Coming soon"
    A Linux build has not yet been published to the Releases page. You can watch the [build workflow](https://github.com/OWNER/token-companion/actions/workflows/build.yml) for status, or [build from source](#build-from-source) in the meantime.

## Requirements

- x86-64 Linux
- **FUSE 2** — required to mount and run `.AppImage` files (most distributions include it)

## Download

Go to the [Releases page](https://github.com/OWNER/token-companion/releases) and download the `.AppImage` file.

## Install and run

```bash
# Make the AppImage executable
chmod +x Token-Companion-x.x.x.AppImage

# Run
./Token-Companion-x.x.x.AppImage
```

No system-wide install is required — the AppImage is self-contained and runs from wherever you place it.

## FUSE on Ubuntu 22.04+

Ubuntu 22.04 and later ship FUSE 3 by default, which AppImages built with FUSE 2 cannot use.

**Option A — install the compatibility library:**

```bash
sudo apt install libfuse2
```

**Option B — extract and run without FUSE:**

```bash
./Token-Companion-x.x.x.AppImage --appimage-extract-and-run
```

This extracts the app to a temporary directory and runs it without mounting, so FUSE is not needed.

## Optional — desktop integration

To add Token Companion to your application launcher, create a `.desktop` file:

```ini title="~/.local/share/applications/token-companion.desktop"
[Desktop Entry]
Name=Token Companion
Comment=Local token cost analyzer for Claude and Codex sessions
Exec=/path/to/Token-Companion-x.x.x.AppImage
Icon=/path/to/icon.png
Terminal=false
Type=Application
Categories=Development;Utility;
```

Then refresh your launcher:

```bash
update-desktop-database ~/.local/share/applications
```

## Build from source

**Prerequisites:**

- Node.js 20+
- `build-essential` + Python 3 (for native module compilation)

```bash
sudo apt install build-essential python3

git clone https://github.com/OWNER/token-companion.git
cd token-companion
npm install
npm run build:linux
```

The `.AppImage` is written to `dist/`.

## Verify the install

After launch, the **Dashboard** tab appears and Token Companion begins scanning `~/.claude/projects` and `~/.codex/sessions`. You should see a **"Scanning…"** indicator within a second or two.

If the app launches but shows no data, see [Getting Started](../usage/getting-started.md).
