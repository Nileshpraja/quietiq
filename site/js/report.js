import {listHistoryEvents} from "./local_history.js";
/** Consent-respecting printable *aggregate* activity report, no images or names. */
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function stat(label, value, explanation) {
  const block = el('div', 'report-stat');
  block.append(el('span', '', label), el('strong', '', String(value)), el('small', '', explanation));
  return block;
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(svgNS, name);
  for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, String(val));
  return node;
}

function makeGraph(rows) {
  const section = el('section', 'report-section');
  section.append(el('h3', '', 'Recent relative microphone levels'));
  const graph = svgEl('svg', {viewBox:'0 0 700 150', role:'img', 'aria-label':'Recent aggregate sound levels, from 0 to 100; not decibels'});
  const values = rows.slice(0, 50).reverse().map(r => Math.min(100, Math.max(0, Number(r.relative_sound) || 0)));
  for (const y of [20, 70, 120]) {
    graph.append(svgEl('line', {x1:34, x2:680, y1:y, y2:y, stroke:'#dccfab', 'stroke-width':1}));
  }
  for (const [x, y, label] of [[3,23,'100'],[17,73,'50'],[24,123,'0']]) {
    const tick = svgEl('text', {x,y,fill:'#655019','font-size':12});
    tick.textContent = label;
    graph.append(tick);
  }
  if (values.length) {
    const path = values.map((v, i) => `${i?'L':'M'}${(34 + i * (646 / Math.max(1,values.length-1))).toFixed(1)},${(120-v).toFixed(1)}`).join(' ');
    graph.append(svgEl('path', {d:path, stroke:'#9b781e', 'stroke-width':3, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}));
  }
  section.append(graph, el('p', 'report-caption', 'Relative audio levels reflect microphone input, not calibrated sound pressure or verified speaking.'));
  return section;
}

function renderReport(rows, sheet) {
  sheet.replaceChildren();
  const header = el('header', 'report-header');
  const mark = el('div', 'report-mark', 'Q');
  const branding = el('div');
  branding.append(el('p', 'report-eyebrow', 'QUIETIQ • REFERENCE EDITION'), el('h1', '', 'AI Classroom Monitor'), el('p', '', 'Aggregate activity report • Local STEM demonstration'));
  header.append(mark, branding);
  sheet.append(header);

  const info = el('div', 'report-meta');
  info.append(el('span', '', `Generated: ${new Date().toLocaleString()}`),
              el('span', '', 'Source: Browser-local QuietIQ activity log (up to 100 most recent events)'));
  sheet.append(info);
  const count = rows.length;
  const starts = rows.filter(r => r.kind === 'speech_started').length;
  const maxFaces = Math.max(0, ...rows.map(r => Number(r.faces) || 0));
  const possiblySpeaking = rows.filter(r => Number(r.possible_speakers) > 0).length;
  const stats = el('section', 'report-stats');
  stats.append(stat('Events included', count, 'Most recent recorded events'),
               stat('Speech-start events', starts, 'Silero voice activity'),
               stat('Max faces in sample', maxFaces, 'Visible faces, not identities'),
               stat('Possible-speaker events', possiblySpeaking, 'Estimate-only events'));
  sheet.append(stats);
  sheet.append(makeGraph(rows));

  const section = el('section', 'report-section');
  section.append(el('h3', '', 'Recent activity history'));
  const table = el('table', 'report-table');
  const head = el('thead');
  const tr = el('tr');
  for (const title of ['Time (local)', 'Event', 'Faces', 'Possible speakers', 'Sound (0–100)']) tr.append(el('th', '', title));
  head.append(tr); table.append(head);
  const body = el('tbody');
  for (const event of rows.slice(0, 28)) {
    const row = el('tr');
    const date = new Date(event.time_utc);
    const time = Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
    const values = [time, String(event.kind || '').replaceAll('_',' '), event.faces, event.possible_speakers, event.relative_sound];
    for (const value of values) row.append(el('td', '', String(value ?? '')));
    body.append(row);
  }
  if (!rows.length) {
    const row = el('tr'); const cell = el('td', '', 'No aggregate activity has been recorded yet.');
    cell.colSpan = 5; row.append(cell); body.append(row);
  }
  table.append(body); section.append(table); sheet.append(section);
  const notes = el('section', 'report-section report-note');
  notes.append(el('h3', '', 'How to interpret this report'),
    el('p', '', 'QuietIQ uses a single microphone for speech activity detection, and visible lip movement to highlight possible speakers. The results are estimates, not identification or evidence of misconduct.'),
    el('p', '', 'This printable report includes only aggregate timestamps, activity types, and counts. It does not include student names, photos, raw audio, or video. Teacher Absence Mode is a manually operated consent-based demonstration feature, not teacher-presence detection.'));
  sheet.append(notes);
}

export function initReport() {
  const button = $('exportReportBtn');
  const dialog = $('reportOverlay');
  const sheet = $('reportSheet');
  const close = () => {
    dialog.hidden = true;
    document.body.classList.remove('report-open');
    button?.focus();
  };
  $('closeReportBtn')?.addEventListener('click', close);
  $('printReportBtn')?.addEventListener('click', () => window.print());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.hidden) close();
  });
  button?.addEventListener('click', async () => {
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing report…';
    try {
      const events = listHistoryEvents(100);
      renderReport(events, sheet);
      dialog.hidden = false;
      document.body.classList.add('report-open');
      $('printReportBtn')?.focus();
    } catch (error) {
      window.alert(`Could not prepare the report: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  });
}
