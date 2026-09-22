#!/usr/bin/env python3
"""Build and verify an import-ready Nihilphile extension archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
import zipfile
from pathlib import Path


EXCLUDED_DIRECTORIES = {".git", "node_modules"}
EXCLUDED_SUFFIXES = {".zip"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def archive_time(path: Path) -> tuple[int, int, int, int, int, int]:
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    timestamp = int(epoch) if epoch else int(path.stat().st_mtime)
    value = time.gmtime(max(timestamp, 315532800))
    return value.tm_year, value.tm_mon, value.tm_mday, value.tm_hour, value.tm_min, value.tm_sec


def selected_files(source: Path, output: Path) -> list[tuple[Path, str]]:
    files: list[tuple[Path, str]] = []
    for path in source.rglob("*"):
        if not path.is_file() or path.resolve() == output:
            continue
        relative = path.relative_to(source)
        if any(part.lower() in EXCLUDED_DIRECTORIES for part in relative.parts[:-1]):
            continue
        if path.suffix.lower() in EXCLUDED_SUFFIXES:
            continue
        files.append((path, relative.as_posix()))
    return sorted(files, key=lambda item: item[1])


def build(source: Path, output: Path) -> dict[str, object]:
    source = source.resolve()
    output = output.resolve()
    if not source.is_dir():
        raise SystemExit(f"Source directory does not exist: {source}")
    if not any((source / name).is_file() for name in ("extension.js", "info.json")):
        raise SystemExit(f"Extension root lacks extension.js/info.json: {source}")
    if output.suffix.lower() != ".zip":
        raise SystemExit(f"Output must end in .zip: {output}")
    if output.exists():
        raise SystemExit(f"Refusing to overwrite existing archive: {output}")

    files = selected_files(source, output)
    if not files:
        raise SystemExit(f"No files selected from: {source}")
    output.parent.mkdir(parents=True, exist_ok=True)

    expected: dict[str, str] = {}
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, name in files:
            data = path.read_bytes()
            expected[name] = hashlib.sha256(data).hexdigest()
            info = zipfile.ZipInfo(name, archive_time(path))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)

    with zipfile.ZipFile(output, "r") as archive:
        names = archive.namelist()
        if names != list(expected):
            raise SystemExit("Archive entries differ from the selected source files")
        for name, expected_hash in expected.items():
            actual_hash = hashlib.sha256(archive.read(name)).hexdigest()
            if actual_hash != expected_hash:
                raise SystemExit(f"Archive verification failed: {name}")

    result = {
        "archive": str(output),
        "entries": len(files),
        "sha256": sha256_file(output),
    }
    print(json.dumps(result, ensure_ascii=False))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    build(args.source, args.output)


if __name__ == "__main__":
    main()
