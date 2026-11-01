"""Offline build checks for the GitHub Pages release."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'


class PublishingTests(unittest.TestCase):
    def test_static_site_has_no_private_server(self):
        self.assertTrue((SITE / 'index.html').is_file())
        self.assertFalse((SITE / 'server').exists())
        self.assertFalse((SITE / 'data').exists())
        self.assertFalse(any(SITE.rglob('*.sqlite3')))
        self.assertFalse(any(SITE.rglob('*.webm')))

    def test_app_has_no_private_api_calls(self):
        for filename in ('app.js','report.js','audio_archive.js','local_history.js'):
            text = (SITE / 'js' / filename).read_text(encoding='utf8')
            self.assertNotIn("fetch('/api/", text, filename)
            self.assertNotIn('fetch("/api/', text, filename)
            self.assertNotIn('localhost:', text, filename)
            self.assertNotIn('127.0.0.1:', text, filename)

    def test_index_uses_relative_asset_paths(self):
        text = (SITE / 'index.html').read_text(encoding='utf8')
        self.assertNotRegex(text, r'''(?:src|href)=["']/''')
        for asset in ['js/app.js', 'css/style.css', 'assets/branding/quietiq-logo.svg']:
            self.assertIn('./'+asset, text)
        for name in ['downloadCsvBtn','startBtn','audioRecordStatus','launchQuietIQBtn','themeToggleBtn']:
            self.assertIn('id="'+name+'"', text)

    def test_config_urls_support_repo_subdirectory(self):
        text = (SITE / 'js' / 'config.js').read_text()
        for group in ['face_mesh','face_detection','onnx','vad']:
            self.assertIn(f"new URL('../assets/{group}/', import.meta.url).href", text)

    def test_public_audio_is_stored_in_browser(self):
        text = (SITE / 'js' / 'audio_archive.js').read_text()
        self.assertIn('indexedDB.open(', text)
        self.assertIn('MediaRecorder(', text)
        self.assertNotIn('/api/', text)
        self.assertIn('MAX_DAYS = 30', text)

    def test_workflow_only_publishes_site(self):
        text = (ROOT / '.github/workflows/pages.yml').read_text()
        self.assertIn('python -m scripts.download_assets', text)
        self.assertIn('actions/upload-pages-artifact@v4', text)
        self.assertIn('actions/deploy-pages@v4', text)
        self.assertRegex(text, r'(?m)^\s*path: site\s*$')

    def test_downloader_is_pinned_and_integrity_checked(self):
        text = (ROOT / 'scripts/download_assets.py').read_text()
        for package in ['@mediapipe/face_mesh','@mediapipe/face_detection','onnxruntime-web','@ricky0123/vad-web']:
            self.assertIn(package, text)
        self.assertIn('sha512', text)
        self.assertIn('WEB_ROOT', text)

    def test_no_unintended_remote_fetch(self):
        source = '\n'.join(p.read_text(encoding='utf8') for p in (SITE / 'js').glob('*.js'))
        urls = re.findall(r'''https?://[^\s'"`]+''', source)
        self.assertTrue(all('www.w3.org/2000/svg' in url for url in urls), urls)


if __name__ == '__main__':
    unittest.main()
