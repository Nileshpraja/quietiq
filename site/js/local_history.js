/** QuietIQ public version: aggregate data never leaves this browser profile. */
const KEY = 'quietiq-public-history-v1';
const KINDS = new Set(['session_started','session_stopped','speech_started','speech_ended','sample']);
const MAX_EVENTS = 1200;
let fallbackEvents = [];

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.warn('Could not read browser activity history', error);
    return fallbackEvents;
  }
}
function save(events) {
  fallbackEvents = events;
  try { localStorage.setItem(KEY, JSON.stringify(events)); }
  catch (error) { console.warn('Browser history not persistent; export CSV if needed', error); }
}
const clamp = (n, upper) => Math.max(0, Math.min(upper, Number.isFinite(+n) ? Math.round(+n) : 0));

export function addHistoryEvent({kind, faces, possible_speakers, relative_sound}) {
  if (!KINDS.has(kind)) throw new Error('Unrecognized activity event');
  const record = {
    time_utc: new Date().toISOString(), kind,
    faces: clamp(faces, 40),
    possible_speakers: clamp(possible_speakers, 40),
    relative_sound: clamp(relative_sound, 100)
  };
  record.possible_speakers = Math.min(record.possible_speakers, record.faces);
  const events = load();
  events.unshift(record);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  save(events);
  return record;
}

export function listHistoryEvents(limit = 100) { return load().slice(0, limit); }
export function clearHistoryEvents() { save([]); }

export function downloadHistoryCsv() {
  const fields = ['time_utc','kind','faces','possible_speakers','relative_sound'];
  const lines = [fields.join(','), ...load().slice().reverse().map(row => fields.map(k => row[k]).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quietiq_activity.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
