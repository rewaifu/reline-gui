## Successor to the now-deprecated [Reline Local GUI](https://github.com/breadyk/reline-local-GUI)

---

We've completely rebuilt it from the ground up: the local configurator is now much lighter, faster, and more advanced.

---
## What's new in 3.0.1
- Fixed splash screen preloading skip on release builds
- Added more lazy imports to improve loading time

## Downloads

| Platform | Package | Notes |
|---|---|---|
| **Windows** | `.exe` (NSIS) | Unsigned — SmartScreen may warn "Unknown publisher". Requires WebView2 (preinstalled on Windows 10/11). |
| **Linux** | `.AppImage` | Universal, portable build. |
| **Linux** | `.deb` / `.rpm` | Adds system integration and pulls in dependencies automatically. |

### Linux requirements

WebKitGTK (`libwebkit2gtk-4.1-0`) and GTK 3 (`libgtk-3-0`) — present on most desktop distros (e.g. Ubuntu 22.04+). The `.deb`/`.rpm` packages install these automatically; the `.AppImage` expects them to be already present on the system.

---

Our Discord: https://discord.gg/hEgdaVzTs9
