/**
 * QuietIQ public website: consented audio clips stay only in the browser's
 * IndexedDB storage for this HTTPS site. There is NO upload endpoint.
 * The microphone records only after a deliberate Start Recording click.
 */
const byId = id => document.getElementById(id);
const MAX_DURATION_MS = 5 * 60 * 1000;
const MAX_CLIPS = 24;
const MAX_DAYS = 30;
const DB_NAME = 'quietiq-browser-audio-v1';
const STORE = 'recordings';

function humanTime(seconds) {
  const n = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`;
}
function mimeOption() {
  if (!window.MediaRecorder) throw new Error('Your browser does not support recording. Try current Chrome or Edge.');
  for (const type of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  throw new Error('No browser-supported audio recording format was found.');
}
function randomId() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(a).map(n=>n.toString(16).padStart(2,'0')).join('');
}
function openDatabase() {
  if (!window.indexedDB) return Promise.reject(new Error('Browser storage is unavailable. Turn off private browsing or use a standard Chrome/Edge profile.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local browser storage'));
    request.onblocked = () => reject(new Error('Browser audio library is locked in another tab'));
  });
}
async function readAll() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Failed to read audio clips'));
      tx.onerror = () => reject(tx.error || new Error('Failed to read audio clips'));
    });
  } finally { db.close(); }
}
async function put(record) {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Audio clip save failed'));
      tx.onabort = () => reject(tx.error || new Error('Audio save was aborted'));
    });
  } finally { db.close(); }
}
async function deleteIds(ids) {
  if (!ids.length) return;
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      for (const id of ids) tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not delete clips'));
    });
  } finally { db.close(); }
}
async function cleanAndList() {
  const all = (await readAll()).sort((a,b) => String(b.created_utc).localeCompare(String(a.created_utc)));
  const cutoff = Date.now() - MAX_DAYS * 86400 * 1000;
  const staleIds = all.filter((clip,i) => i >= MAX_CLIPS || Date.parse(clip.created_utc) < cutoff).map(clip=>clip.id);
  if (staleIds.length) await deleteIds(staleIds);
  return all.filter(c=>!staleIds.includes(c.id));
}

export class TeacherAudioLibrary {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.recorder = null;
    this.startedAt = 0;
    this.chunks = [];
    this.timeoutId = null;
    this.tickerId = null;
    this.finishPromise = null;
    this.pending = false;
    this.shouldSave = true;
    this.backupUrl = null;
    this.playbackUrls = [];
    this.status = 'Recording OFF — start demo mode and confirm audio consent';
    this.error = false;
    this.emit();
  }

  get isRecording() { return this.recorder?.state === 'recording'; }

  emit(text = this.status, error = this.error) {
    this.status = text;
    this.error = error;
    const statusNode = byId('audioRecordStatus');
    if (statusNode) {
      statusNode.textContent = text;
      statusNode.classList.toggle('recording-error', Boolean(error));
    }
    const elapsed = this.startedAt && (this.isRecording || this.pending)
      ? humanTime((performance.now() - this.startedAt) / 1000) : '00:00';
    if (byId('audioRecordTimer')) byId('audioRecordTimer').textContent = elapsed;
    const banner = byId('audioRecordingBanner');
    if (banner) {
      banner.hidden = !this.isRecording;
      if (byId('recordingBannerTime')) byId('recordingBannerTime').textContent = elapsed;
    }
    this.onChange();
  }

  revokeBackup() {
    if (this.backupUrl) URL.revokeObjectURL(this.backupUrl);
    this.backupUrl = null;
    if (byId('failedAudioDownload')) byId('failedAudioDownload').hidden = true;
  }

  async start(stream) {
    if (this.isRecording || this.pending) throw new Error('A recording is already running or being saved.');
    const track = stream?.getAudioTracks().find(t => t.readyState === 'live' && t.enabled && !t.muted);
    if (!track) throw new Error('No live microphone track. Start the monitor and select your USB mic first.');
    const type = mimeOption();
    this.revokeBackup();
    const recorder = new MediaRecorder(new MediaStream([track]), {mimeType:type, audioBitsPerSecond:64000});
    this.chunks = [];
    this.shouldSave = true;
    this.recorder = recorder;
    this.startedAt = performance.now();
    this.finishPromise = new Promise(resolve => {
      recorder.ondataavailable = e => { if (e.data?.size) this.chunks.push(e.data); };
      recorder.onerror = e => this.emit(`Recorder error: ${e.error?.message || 'unknown error'}`, true);
      recorder.onstop = async () => {
        this.pending = true;
        this.recorder = null;
        clearTimeout(this.timeoutId);
        clearInterval(this.tickerId);
        const seconds = Math.min(MAX_DURATION_MS / 1000 + 4, Math.max(.1,(performance.now()-this.startedAt)/1000));
        const blob = new Blob(this.chunks, {type:recorder.mimeType || type});
        this.chunks = [];
        try {
          if (!this.shouldSave) {
            this.emit('Recording discarded because audio consent was withdrawn.');
          } else if (blob.size < 64) {
            this.emit('Recording was too short or empty. Speak for a few seconds and try again.', true);
          } else {
            this.emit('Saving the audio clip privately in this browser…');
            await put({
              id:randomId(), blob, mime:blob.type,
              duration_seconds:seconds, size_bytes:blob.size,
              created_utc:new Date().toISOString()
            });
            await this.refresh();
            this.emit(`Saved locally in this browser (${humanTime(seconds)}); it was NOT uploaded.`);
          }
        } catch (err) {
          this.emit(`Browser storage failed: ${err.message}. Download your backup below.`, true);
          this.backupUrl = URL.createObjectURL(blob);
          const fallback = byId('failedAudioDownload');
          if (fallback) {
            fallback.href = this.backupUrl;
            fallback.download = `quietiq-backup-${Date.now()}.${blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm'}`;
            fallback.hidden = false;
          }
        } finally {
          this.pending = false;
          this.startedAt = 0;
          this.emit();
          resolve();
        }
      };
    });
    try { recorder.start(1000); }
    catch (err) {
      this.recorder = null; this.startedAt = 0; this.finishPromise = null;
      throw err;
    }
    this.emit('RECORDING — only this browser receives your microphone audio.');
    this.tickerId = setInterval(()=>this.emit(),400);
    this.timeoutId = setTimeout(()=>{ this.emit('5-minute clip limit reached. Saving…'); void this.stop(true); },MAX_DURATION_MS);
  }

  async stop(save = true) {
    if (!this.recorder && this.pending) return this.finishPromise;
    if (!this.recorder) return;
    this.shouldSave = this.shouldSave && save;
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    return this.finishPromise;
  }

  async refresh() {
    try {
      const clips = await cleanAndList();
      this.renderList(clips);
    } catch (err) {
      const list = byId('recordingsList');
      if (list) list.textContent = `Browser audio library unavailable: ${err.message}`;
    }
  }

  renderList(clips) {
    const list = byId('recordingsList');
    if (!list) return;
    for (const url of this.playbackUrls) URL.revokeObjectURL(url);
    this.playbackUrls = [];
    list.replaceChildren();
    if (byId('savedRecordingCount')) byId('savedRecordingCount').textContent = String(clips.length);
    if (!clips.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No browser-local audio clips. Record with informed consent to create a clip.';
      list.append(p);
      return;
    }
    for (const clip of clips) {
      if (!/^[a-f0-9]{32}$/.test(clip.id) || !(clip.blob instanceof Blob)) continue;
      const item = document.createElement('article'); item.className = 'audio-clip';
      const head = document.createElement('div'); head.className = 'audio-clip-head';
      const heading = document.createElement('div');
      const date = document.createElement('strong');
      date.textContent = `Recording · ${new Date(clip.created_utc).toLocaleString()}`;
      const details = document.createElement('small');
      details.textContent = `${humanTime(clip.duration_seconds)} · ${(clip.size_bytes/1048576).toFixed(2)} MB · saved in this browser only`;
      heading.append(date,details);
      const url = URL.createObjectURL(clip.blob);
      this.playbackUrls.push(url);
      const player = document.createElement('audio');
      player.controls = true; player.preload = 'metadata'; player.src = url;
      player.setAttribute('aria-label', `Listen to recording from ${date.textContent}`);
      const actions = document.createElement('div'); actions.className = 'audio-clip-actions';
      const download = document.createElement('a'); download.className = 'button secondary';
      download.textContent = 'Download'; download.href = url;
      download.download = `quietiq-${clip.id}.${clip.mime?.includes('mp4')?'m4a':clip.mime?.includes('ogg')?'ogg':'webm'}`;
      const erase = document.createElement('button'); erase.type = 'button';
      erase.className = 'button secondary'; erase.textContent = 'Delete';
      erase.addEventListener('click', async () => {
        if (!confirm('Permanently delete this audio clip from this browser?')) return;
        await deleteIds([clip.id]); await this.refresh();
      });
      actions.append(download,erase); head.append(heading,actions); item.append(head,player); list.append(item);
    }
  }

  async deleteAll() {
    if (this.isRecording || this.pending) throw new Error('Stop the active recording first.');
    const rows = await readAll();
    await deleteIds(rows.map(row=>row.id));
    await this.refresh();
    this.emit('All browser-local audio clips were deleted.');
  }
}
