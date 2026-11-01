"""One-time downloader for local Face Detection + Face Mesh + Silero browser assets.

Uses only the Python standard library and checks exact npm release metadata and
SHA-512 package integrity. No pip, Windows DLLs, or third-party Python modules.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile
import tempfile
from urllib.error import URLError, HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from scripts.ai_assets import WEB_ROOT, missing_assets

BASE = Path(__file__).resolve().parent.parent
CACHE = BASE / "downloads"
PACKAGES = (
    ("@mediapipe/face_mesh", "0.4.1633559619", "face_mesh"),
    ("@mediapipe/face_detection", "0.4.1646425229", "face_detection"),
    ("onnxruntime-web", "1.22.0", "onnx"),
    ("@ricky0123/vad-web", "0.0.31", "vad"),
)


def fetch(url: str, max_bytes: int = 140_000_000) -> bytes:
    request = Request(url, headers={
        "User-Agent": "QuietIQ-Setup/1.0", "Accept": "*/*",
    })
    with urlopen(request, timeout=60) as response:
        stated = int(response.headers.get("Content-Length", "0"))
        if stated > max_bytes:
            raise RuntimeError("Download exceeds size limit")
        chunks = []
        total = 0
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            total += len(block)
            if total > max_bytes:
                raise RuntimeError("Download exceeds size limit")
            chunks.append(block)
    return b"".join(chunks)


def verified_archive(name: str, version: str) -> bytes:
    metadata_url = f"https://registry.npmjs.org/{quote(name, safe='')}/{version}"
    print(f"Reading release information for {name}@{version} ...", flush=True)
    data = json.loads(fetch(metadata_url, max_bytes=1_000_000))
    if data.get("name") != name or data.get("version") != version:
        raise RuntimeError("Unexpected package/version from npm registry")
    dist = data.get("dist", {})
    integrity = dist.get("integrity", "")
    if not integrity.startswith("sha512-"):
        raise RuntimeError(f"No SHA-512 integrity provided for {name}")
    # Accept the signed npm release metadata, but never arbitrary archive paths.
    tarball_url = dist.get("tarball", "")
    if not tarball_url.startswith("https://registry.npmjs.org/"):
        raise RuntimeError("Unexpected npm tarball origin")
    CACHE.mkdir(parents=True, exist_ok=True)
    safe = name.replace("@", "").replace("/", "_")
    cached = CACHE / f"{safe}-{version}.tgz"
    if cached.exists() and cached.stat().st_size:
        payload = cached.read_bytes()
    else:
        print(f"Downloading {name}@{version} ...", flush=True)
        payload = fetch(tarball_url)
    actual = base64.b64encode(hashlib.sha512(payload).digest()).decode("ascii")
    if actual != integrity.partition("-")[2]:
        cached.unlink(missing_ok=True)
        raise RuntimeError(f"Package integrity verification FAILED for {name}")
    if not cached.exists():
        cached.write_bytes(payload)
    print(f"Verified {name}, {len(payload) // 1024:,} KB.", flush=True)
    return payload


# All files required by the published full-range JS Face Detection graph.
DETECTION_FILES = {
    "face_detection.js", "face_detection_full.binarypb",
    "face_detection_short.binarypb", "face_detection_full_range.tflite",
    "face_detection_full_range_sparse.tflite", "face_detection_short_range.tflite",
    "face_detection_solution_simd_wasm_bin.data",
    "face_detection_solution_simd_wasm_bin.js",
    "face_detection_solution_simd_wasm_bin.wasm",
    "face_detection_solution_wasm_bin.js",
    "face_detection_solution_wasm_bin.wasm",
}

FACE_FILES = {
    "face_mesh.js", "face_mesh.binarypb",
    "face_mesh_solution_packed_assets.data",
    "face_mesh_solution_packed_assets_loader.js",
    "face_mesh_solution_simd_wasm_bin.js",
    "face_mesh_solution_simd_wasm_bin.wasm",
    "face_mesh_solution_wasm_bin.js",
    "face_mesh_solution_wasm_bin.wasm",
}


def destination_for(group: str, filename: str):
    if not filename.startswith("package/"):
        return None
    rel = filename[len("package/"):]
    # Retain upstream license and notice files when included in the pinned npm
    # release, so public static distributions include their legal notices.
    if rel in {"LICENSE", "LICENSE.txt", "LICENSE.md", "NOTICE", "NOTICE.txt", "NOTICE.md"}:
        return WEB_ROOT / "assets" / group / rel
    if group == "face_mesh" and rel in FACE_FILES:
        return WEB_ROOT / "assets/face_mesh" / rel
    if group == "face_detection" and rel in DETECTION_FILES:
        return WEB_ROOT / "assets/face_detection" / rel
    if group == "onnx" and rel.startswith("dist/") and rel.count("/") == 1:
        basename = rel[5:]
        if basename == "ort.wasm.min.js" or (
            basename.startswith("ort-wasm-") and basename.endswith((".wasm", ".mjs"))
        ):
            return WEB_ROOT / "assets/onnx" / basename
    if group == "vad" and rel.startswith("dist/") and rel.count("/") == 1:
        basename = rel[5:]
        if basename in ("bundle.min.js", "vad.worklet.bundle.min.js") or (
            basename.startswith("silero_vad_") and basename.endswith(".onnx")
        ):
            return WEB_ROOT / "assets/vad" / basename
    return None


def extract_selected(payload: bytes, group: str):
    print(f"Extracting {group} library files ...", flush=True)
    copied = 0
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        for member in archive:
            if not member.isfile():
                continue
            dest = destination_for(group, member.name)
            if dest is None:
                continue
            if member.size > 80_000_000:
                raise RuntimeError("Runtime file too large")
            entry = archive.extractfile(member)
            if entry is None:
                raise RuntimeError("Cannot read archive entry")
            dest.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False) as tmp:
                temporary_name = tmp.name
                shutil.copyfileobj(entry, tmp)
            os.replace(temporary_name, dest)
            copied += 1
    if not copied:
        raise RuntimeError(f"Package {group} had no expected files")
    print(f"Saved {copied} {group} files.", flush=True)


def main():
    print("\nQuietIQ | Public static website AI-asset setup\n")
    print("Downloads official pinned npm packages; verifies SHA-512 release integrity.")
    print("No NumPy, pip, Node.js or Windows security changes are needed.\n")
    if not missing_assets():
        print("AI model files already present. Setup is complete.")
        return 0
    try:
        for package, version, group in PACKAGES:
            # Reuse your working Face Mesh/VAD/ONNX libraries after an upgrade.
            if not any(item.startswith(f"assets/{group}/") for item in missing_assets()):
                print(f"Reusing existing {group} files.", flush=True)
                continue
            extract_selected(verified_archive(package, version), group)
        missing = missing_assets()
        if missing:
            raise RuntimeError("AI setup incomplete; missing: " + ", ".join(missing))
    except (OSError, URLError, HTTPError, TimeoutError, RuntimeError,
            ValueError, KeyError, tarfile.TarError) as err:
        print("\nSETUP FAILED: " + str(err), flush=True)
        print("Please share this error. It may be a network restriction on registry.npmjs.org.")
        print("Do not disable Windows Security to resolve a download failure.")
        return 1
    print("\nSUCCESS! Browser AI assets are ready for website deployment.")
    print("Assets ready for static hosting (GitHub Pages).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
