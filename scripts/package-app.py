#!/usr/bin/env python3
"""
Package the whole application into an upload-ready archive.

    python3 scripts/package-app.py                 # writes to ./dist-package
    python3 scripts/package-app.py /some/folder    # writes to a folder of your choice

Creates two identical-content archives:

    Scenering-app.zip      - use with any zip tool
    Scenering-app.tar.gz   - use with tar (can be piped straight out of curl)

Both contain every project file except `node_modules`, `.git`, build output and
temporary files. Two very large audio files are skipped on purpose because they
are already in the GitHub repository, which keeps the download at ~11 MB instead
of ~33 MB:

    public/sounds/clair_de_lune.ogg
    public/sounds/gymnopedie_no1.mp3

If you need a standalone copy that includes them (for a brand-new repo rather
than a copy over an existing clone), run with --include-large-audio.

Never packaged: `.env` (your keys stay on your machine). Only `.env.example` ships.
"""

import os
import sys
import tarfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_DIRS = {"node_modules", ".git", "dist", "dist-package", ".vite", "__pycache__", ".cache"}
SKIP_SUFFIXES = (".tmp", ".tmp.png", ".tmp.ts", ".tmp.tsx", ".tmp.cjs", ".tmp.log", ".DS_Store")

# Present in the GitHub repo already; skip to keep the download small.
LARGE_AUDIO = {
    "public/sounds/clair_de_lune.ogg",
    "public/sounds/gymnopedie_no1.mp3",
}

# Secrets must never leave the machine.
NEVER_SHIP = {".env", ".env.local", ".env.production", ".netrc", ".git-credentials"}


def collect(include_large_audio: bool) -> list[str]:
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel_dir = os.path.relpath(dirpath, ROOT).replace("\\", "/")
        for fn in filenames:
            if fn.endswith(SKIP_SUFFIXES) or fn in NEVER_SHIP:
                continue
            rel = fn if rel_dir == "." else f"{rel_dir}/{fn}"
            if not include_large_audio and rel in LARGE_AUDIO:
                continue
            files.append(rel)
    return sorted(files)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    include_large_audio = "--include-large-audio" in sys.argv
    out_dir = os.path.abspath(args[0]) if args else os.path.join(ROOT, "dist-package")
    os.makedirs(out_dir, exist_ok=True)

    files = collect(include_large_audio)
    zip_path = os.path.join(out_dir, "Scenering-app.zip")
    tar_path = os.path.join(out_dir, "Scenering-app.tar.gz")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for rel in files:
            z.write(os.path.join(ROOT, rel), rel)

    with tarfile.open(tar_path, "w:gz") as t:
        for rel in files:
            t.add(os.path.join(ROOT, rel), arcname=rel)

    mb = lambda p: os.path.getsize(p) / (1024 * 1024)
    print(f"packed {len(files)} files")
    print(f"  {zip_path}  ({mb(zip_path):.1f} MB)")
    print(f"  {tar_path}  ({mb(tar_path):.1f} MB)")
    if not include_large_audio:
        print("  (skipped 2 large audio files already in the GitHub repo)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
