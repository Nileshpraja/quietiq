# QuietIQ — Public Website Edition

**Ready-to-deploy GitHub Pages source**, adapted from QuietIQ Audio Frame Fix.

The earlier QuietIQ was a Python `http://127.0.0.1:8914` app. **Do not make that Python API publicly accessible**: its recordings and history endpoints have no user authentication. This release deploys **only a static HTTPS website**, keeping processing and optional recordings in each visitor's own browser profile.

## Publish on GitHub Pages

1. Extract this ZIP on your PC.
2. Create an **empty GitHub repository** called `quietiq` (public for GitHub Free Pages).
3. Upload/commit the **contents of this project folder**, including the **`.github/workflows/pages.yml`** folder, to the repository's `main` branch. GitHub Desktop or `git` works (example commands below).
4. In the GitHub repository, open **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Open **Actions** and confirm the **Publish QuietIQ website** workflow succeeded. The workflow downloads four pinned npm AI packages, verifies SHA-512 hashes, and deploys the `site/` folder only.
6. Find your website URL in **Settings → Pages**. For a typical repo `quietiq`, it is `https://YOUR_USERNAME.github.io/quietiq/`.
7. Open the website in Chrome or Edge over HTTPS, select your USB webcam + microphone, grant browser permission, and test Face Mesh, Silero AI, and recording only with informed consent.

**Important:** We have *not* published this project to your GitHub account. The account connection and deployment are actions only you (or a connected authorized GitHub integration) can complete.

### Example with Git (requires Git installed)

In Command Prompt, inside the extracted project folder, run:

```bat
git init
git add .
git commit -m "Publish QuietIQ website"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/quietiq.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub account name. Do not paste an access token or password into chat.

## What works in the public version?

- Cinematic black / white / gold website, custom SVG logo, dark mode, light mode, fullscreen, and **LAUNCH QUIETIQ** navigation.
- Browser camera + microphone access over HTTPS, only after the visitor clicks and approves access.
- MediaPipe Face Mesh and Silero VAD, plus an **experimental** optional classroom-wide Face Detection scan. A green face box means a detected face; a red box is **only a possible-speaker estimate**, not verified identity.
- Live relative noise level, status checks, performance presets, mirror camera, consent-based snapshots, and a printable aggregate report.
- Aggregate event history in `localStorage` in the same browser/profile, with CSV export; max 1,200 recent events.
- Optional **consented, manually started** audio recording in browser `IndexedDB` on that device; playback, download and delete are available there. Up to five minutes per clip and 24 clips; clips older than 30 days are cleaned when the library is opened. Browser storage may be erased sooner.

### Public-version limitations

- No Python server is deployed, no SQLite server database, no cloud accounts, and **no admin login**.
- The website **does not upload raw audio, camera video, photos, or activity history**. The hosting provider will still receive ordinary website traffic data such as IP addresses/requests.
- **Recordings are not synchronized** between phones/laptops/browsers. A teacher cannot play recordings made on a student's device unless the file was explicitly downloaded and transferred by an authorized person. Do not use this public browser storage as your only archive.
- Browser IndexedDB is **not password-protected**; anyone with access to that same browser profile may see recordings. Use a school-approved device and permission process. For controlled teacher archives, keep the **private localhost QuietIQ project** on the teacher's own protected computer.
- No deployment has been live-tested here because the AI binaries could not be downloaded in this environment. The Pages workflow downloads them during deployment. Test actual camera/mic inference on the published URL before use.
- Face Mesh scans only a small subset of faces for lip movement; the optional 40-box wide scan is experimental and not an attendance or identity system. A single USB microphone cannot reliably identify a speaker among 29 students.
- Never secretly record students. Enable photo/audio capture only with explicit informed participant consent and all school/guardian permissions required in your location.

## Project structure

```text
QuietIQ_Public_Release/
  .github/workflows/pages.yml  GitHub Actions deployment
  site/                        HTML, CSS, JavaScript, SVG, and AI assets after build
    index.html
    css/
    js/
      app.js
      audio_archive.js        IndexedDB-based local recordings
      local_history.js        Browser-only aggregate history
      face_ai.js / speech_ai.js / ...
    assets/branding/quietiq-logo.svg
    assets/{face_mesh,face_detection,onnx,vad}/  populated by workflow
  scripts/download_assets.py   Downloads official pinned AI packages, SHA-512 verified
  scripts/ai_assets.py         Required asset manifest
  tests/test_publish.py        Offline deployment checks
```

The GitHub Pages workflow publishes **only** `site/`. Source code in `scripts/`, tests, Python utilities, and downloads are **not** part of the public website artifact. No classroom audio or saved events are included.

## Preview on your own laptop

You can preview the page (without downloaded AI binaries) by running `python -m http.server 8000 -d site` inside this folder, then visiting `http://127.0.0.1:8000`. To make the AI run locally, first run `python -m scripts.download_assets` (internet required); the same process runs automatically during GitHub Pages deployment.

## Troubleshooting

**Website opens but Face Mesh/Silero says assets are missing:** Check the GitHub **Actions** workflow log; it may have failed to download a pinned npm package. Wait for a green success tick then refresh the page using Ctrl+Shift+R.

**Microphone sound meter moves but Silero frames stay 0:** Use **Retry speech AI (compatibility mode)** and inspect audio diagnostic messages. Browser security/privacy extensions may block WebAssembly/AudioWorklet. This is still a potential unresolved issue from the local prototype.

**Camera permission unavailable:** Use the HTTPS GitHub Pages address directly in Chrome/Edge (not inside a restricted embedded preview). Grant Camera/Microphone site permissions. An insecure `http://` website will not get camera/mic access.

**Saved browser recordings missing:** They only live on the originating browser profile and device. Private browsing, storage clearing, or moving to a different laptop loses them. For important recordings use **Download**, then follow school-approved secure storage procedures.

**Security:** Never add the `server/http_api.py` API to a publicly reachable host without proper authentication, authorization, encryption, and secure retention policies. Publishing the original local version as-is would expose teacher audio recordings to visitors.
