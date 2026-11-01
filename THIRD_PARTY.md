# Third-party components used by QuietIQ

The GitHub Pages build downloads, verifies and republishes selected static files from the following *pinned* npm package releases. The downloader also retains any upstream LICENSE and NOTICE files present at the package root.

- `@mediapipe/face_mesh` `0.4.1633559619` — Google MediaPipe legacy Face Mesh (Apache-2.0).
- `@mediapipe/face_detection` `0.4.1646425229` — Google MediaPipe legacy Face Detection (Apache-2.0).
- `onnxruntime-web` `1.22.0` — Microsoft ONNX Runtime Web (MIT).
- `@ricky0123/vad-web` `0.0.31` — JavaScript VAD package (ISC as shown in its npm metadata).
- Silero VAD ONNX model embedded in the VAD package — consult the upstream Silero VAD repository for model-specific redistribution terms.

Official repositories: https://github.com/google-ai-edge/mediapipe , https://github.com/microsoft/onnxruntime , https://github.com/ricky0123/vad , https://github.com/snakers4/silero-vad .

Review all redistribution terms before publishing a live public website. No binary dependencies are committed to the source ZIP; they are obtained from the verified npm releases by the GitHub Actions deployment workflow.
