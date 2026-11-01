"""Report mandatory browser AI files separately from the experimental scan.

MediaPipe Face Detection occasionally fails inside its legacy WASM runtime on
some Windows/browser configurations. The working Face Mesh + Silero pipeline
must not be blocked by an optional classroom detector or its absent assets.
"""
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent.parent / "site"

CORE_ASSETS = (
    "assets/face_mesh/face_mesh.js",
    "assets/face_mesh/face_mesh_solution_packed_assets.data",
    "assets/face_mesh/face_mesh_solution_packed_assets_loader.js",
    "assets/face_mesh/face_mesh_solution_simd_wasm_bin.js",
    "assets/face_mesh/face_mesh_solution_simd_wasm_bin.wasm",
    "assets/face_mesh/face_mesh_solution_wasm_bin.js",
    "assets/face_mesh/face_mesh_solution_wasm_bin.wasm",
    "assets/vad/bundle.min.js",
    "assets/vad/vad.worklet.bundle.min.js",
    "assets/vad/silero_vad_v5.onnx",
    "assets/onnx/ort.wasm.min.js",
    "assets/onnx/ort-wasm-simd-threaded.mjs",
    "assets/onnx/ort-wasm-simd-threaded.wasm",
)

WIDE_SCAN_ASSETS = (
    "assets/face_detection/face_detection.js",
    "assets/face_detection/face_detection_full.binarypb",
    "assets/face_detection/face_detection_full_range_sparse.tflite",
    "assets/face_detection/face_detection_short.binarypb",
    "assets/face_detection/face_detection_short_range.tflite",
    "assets/face_detection/face_detection_solution_simd_wasm_bin.js",
    "assets/face_detection/face_detection_solution_simd_wasm_bin.wasm",
    "assets/face_detection/face_detection_solution_wasm_bin.js",
    "assets/face_detection/face_detection_solution_wasm_bin.wasm",
)

# Retain the complete set for the downloader: setup installs both pipelines.
REQUIRED_ASSETS = CORE_ASSETS + WIDE_SCAN_ASSETS


def _missing(assets):
    return [asset for asset in assets
            if not (WEB_ROOT / asset).is_file() or (WEB_ROOT / asset).stat().st_size < 100]


def missing_assets():
    """All files required by the one-time downloader."""
    return _missing(REQUIRED_ASSETS)


def assets_report():
    """The core pipeline may run even if optional Face Detection is absent."""
    missing_core = _missing(CORE_ASSETS)
    missing_wide = _missing(WIDE_SCAN_ASSETS)
    return {
        "ready": not missing_core,
        "missing": missing_core,
        "wide_scan_ready": not missing_wide,
        "missing_wide_scan": missing_wide,
        "solution": "MediaPipe Face Mesh + Silero VAD; optional Face Detection",
        "instructions": "Run setup_ai_assets.bat to install or repair AI files. Wide scan is optional.",
    }
