#!/usr/bin/env python3
"""Download the pinned Mac Karing delivery package and verify SHA-256."""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
import urllib.request
from pathlib import Path

class Failure(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Failure(message)

VERSION = "1.2.25.2802"
FILENAME = "karing_%s_macos_universal.dmg" % VERSION
URL = "https://github.com/KaringX/karing/releases/download/v%s/%s" % (VERSION, FILENAME)
SHA256 = "90aba8e17bdf15564710e84e6328ce9c9d3edcf45c79eccc1d33995d50c2f458"
ROOT = Path(__file__).resolve().parents[2]


def checksum(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def download(folder):
    folder = Path(folder).expanduser().resolve()
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / FILENAME
    if target.is_file() and checksum(target) == SHA256:
        return {"status": "cached", "version": VERSION, "path": str(target), "sha256": SHA256}
    with tempfile.TemporaryDirectory(dir=str(folder)) as tmp:
        staged = Path(tmp) / FILENAME
        with urllib.request.urlopen(URL, timeout=60) as src, staged.open("wb") as dst:
            shutil.copyfileobj(src, dst)
        require(checksum(staged) == SHA256, "karing_checksum_mismatch")
        os.replace(staged, target)
    return {"status": "downloaded", "version": VERSION, "path": str(target), "sha256": SHA256}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "runtime/mac-downloads")
    parser.add_argument("--download", action="store_true", help="explicitly download the official package")
    args = parser.parse_args()
    if not args.download:
        print(json.dumps({"status": "not-started", "next": "Use --download on the customer device after authorization; see guides/mac.md"}))
        return 0
    try:
        result = download(args.output_dir)
    except Exception as e:
        result = {"status": "failed", "error": str(e) if isinstance(e, Failure) else type(e).__name__}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(result["status"] == "failed")


if __name__ == "__main__":
    raise SystemExit(main())
