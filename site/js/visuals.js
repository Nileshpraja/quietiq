const byId = id => document.getElementById(id);

export function message(text, isError = false) {
  const node = byId("message");
  node.textContent = text;
  const styles = getComputedStyle(document.body);
  node.style.color = isError ? "#ffc3c3" : (styles.getPropertyValue("--msg") || "#c4e4ff").trim();
}

// Face Mesh coordinates are measured on the unmirrored frame. The UI can
// reverse X without modifying inference input or flipping label text.
export function displayX(x, width = 0, mirrored = false) {
  return mirrored ? 1 - x - width : x;
}

function isCameraMirrored() {
  return Boolean(byId("cameraStage")?.classList.contains("mirror-camera"));
}

export function drawOverlay(tracks, possibleIds, video, mouthTestIds = []) {
  const canvas = byId("faceOverlay");
  if (!video?.videoWidth) return;
  // The overlay is display-only. On HD cameras avoid reallocating and
  // painting a full 1080p canvas when 1024px is enough for visible boxes.
  const width = Math.min(1024, video.videoWidth);
  const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const mirrored = isCameraMirrored();
  ctx.clearRect(0, 0, w, h);
  // Dense classroom: thinner boxes, fewer labels, less occlusion of faces.
  const dense = tracks.length > 10;
  ctx.lineWidth = dense ? Math.max(1.4, w / 850) : Math.max(2, w / 330);
  ctx.font = `600 ${Math.max(12, Math.round(w / (dense ? 110 : 54)))}px Segoe UI, Arial`;
  for (const track of tracks) {
    const possible = possibleIds.includes(track.id);
    const movingOnly = !possible && mouthTestIds.includes(track.id);
    const x = displayX(track.x, track.w, mirrored) * w, y = track.y * h;
    const bw = track.w * w, bh = track.h * h;
    const color = possible ? "#ff5366" : movingOnly ? "#ffcc60" : "#5ce5a0";
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, bw, bh);
    // Don't print 29+ large "Face" labels over a classroom. Explicit
    // possible-speaker/mouth-test labels remain visible for the demonstration.
    if (!dense || possible || movingOnly) {
      const label = possible ? "Possible speaker" : movingOnly ? "Mouth moving (test)" : "Face";
      const width = ctx.measureText(label).width + 12;
      const labelHeight = dense ? 21 : 27;
      const top = Math.max(0, y - labelHeight);
      ctx.fillStyle = possible ? "#b52638" : movingOnly ? "#765400" : "#075d41";
      ctx.fillRect(x, top, width, labelHeight);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 6, top + (dense ? 15 : 19));
    }
    // Visible Face Mesh lip landmarks; these are NOT a recognition signature.
    ctx.fillStyle = possible ? "#ffb2bb" : "#9cebd6";
    for (const pt of track.lipPoints || []) {
      ctx.beginPath();
      ctx.arc(displayX(pt.x, 0, mirrored) * w, pt.y * h, Math.max(1.7, w / 500), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function clearOverlay() {
  const canvas = byId("faceOverlay");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

export function drawNoiseGraph(history) {
  const canvas = byId("noiseCanvas");
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const light = document.body.dataset.theme === "light";
  const left = 44, right = w - 18, top = 16, bottom = h - 28;
  const plotW = right - left, plotH = bottom - top;
  const styles = getComputedStyle(document.body);
  const gold = (styles.getPropertyValue("--gold") || "#d4af37").trim();
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  if (light) {
    bg.addColorStop(0, "#fffdf6"); bg.addColorStop(1, "#f7efdc");
  } else {
    bg.addColorStop(0, "#0b0b0b"); bg.addColorStop(1, "#19140a");
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.font = "12px Segoe UI, Arial";
  ctx.textAlign = "right";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (plotH * i / 4);
    ctx.beginPath();
    ctx.strokeStyle = light ? "rgba(118,97,43,.20)" : "rgba(222,193,111,.15)";
    ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillStyle = light ? "#6f5b31" : "#e5cc88";
    ctx.fillText(String(100 - 25 * i), left - 8, y + 4);
  }
  for (let i = 0; i <= 8; i++) {
    const x = left + i * (plotW / 8);
    ctx.beginPath();
    ctx.strokeStyle = light ? "rgba(118,97,43,.10)" : "rgba(222,193,111,.08)";
    ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = light ? "#8e7439" : "#d1ba78";
  ctx.fillText("RECENT", left, h - 8);
  ctx.textAlign = "right";
  ctx.fillText("NOW", right, h - 8);
  if (!history?.length) return;
  const data = history.map(v => Math.max(0, Math.min(100, Number(v) || 0)));
  const coords = data.map((v, i) => ({
    x: left + (data.length <= 1 ? plotW : i / (data.length - 1) * plotW),
    y: bottom - v / 100 * plotH
  }));
  ctx.beginPath();
  ctx.moveTo(coords[0].x, bottom);
  for (const p of coords) ctx.lineTo(p.x, p.y);
  ctx.lineTo(coords[coords.length - 1].x, bottom);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, top, 0, bottom);
  fill.addColorStop(0, light ? "rgba(173,128,20,.32)" : "rgba(235,191,70,.42)");
  fill.addColorStop(1, light ? "rgba(173,128,20,.02)" : "rgba(235,191,70,.02)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  coords.forEach((p, i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
  ctx.lineWidth = 2.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = gold;
  ctx.shadowColor = light ? "rgba(142,104,17,.24)" : "rgba(245,210,108,.46)";
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.restore();
  const end = coords[coords.length - 1];
  ctx.beginPath(); ctx.arc(end.x,end.y,4,0,2*Math.PI);
  ctx.fillStyle = gold; ctx.fill();
  ctx.beginPath(); ctx.arc(end.x,end.y,7.5,0,2*Math.PI);
  ctx.strokeStyle = light ? "rgba(173,128,20,.27)" : "rgba(235,191,70,.3)";
  ctx.stroke();
}

export function renderHistory(events) {
  const body = byId("historyBody");
  body.replaceChildren();
  if (!events.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5; td.className = "empty"; td.textContent = "No activity recorded.";
    tr.append(td); body.append(tr); return;
  }
  for (const event of events) {
    const tr = document.createElement("tr");
    const local = new Date(event.time_utc).toLocaleString();
    for (const value of [local, event.kind.replaceAll("_", " "), event.faces,
      event.possible_speakers, event.relative_sound]) {
      const td = document.createElement("td"); td.textContent = String(value); tr.append(td);
    }
    body.append(tr);
  }
}

export function croppedPhoto(video, track) {
  if (!video.videoWidth || !video.videoHeight) return null;
  const w = video.videoWidth, h = video.videoHeight;
  const x = track.x * w, y = track.y * h, tw = track.w * w, th = track.h * h;
  const side = Math.max(tw, th) * 1.22;
  const sx = Math.max(0, Math.min(w - side, x + tw / 2 - side / 2));
  const sy = Math.max(0, Math.min(h - side, y + th / 2 - side / 2));
  const size = Math.max(1, Math.min(side, w - sx, h - sy));
  const canvas = document.createElement("canvas");
  canvas.width = 240; canvas.height = 240;
  const ctx = canvas.getContext("2d");
  // Keep consented saved photos in the same left/right orientation as preview.
  if (isCameraMirrored()) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, size, size, 0, 0, 240, 240);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function addPhoto(dataUrl, timeLabel, maxPhotos, labelText = "Possible speaker (estimate)") {
  const list = byId("photos");
  list.querySelector(".empty")?.remove();
  const figure = document.createElement("div"); figure.className = "photo";
  const img = document.createElement("img"); img.src = dataUrl;
  img.alt = `Cropped consenting demo participant: ${labelText}`;
  const label = document.createElement("small"); label.textContent = `${labelText} · ${timeLabel}`;
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `quietiq-consented-demo-${Date.now()}.jpg`;
  link.textContent = "Download locally";
  figure.append(img, label, link);
  list.prepend(figure);
  while (list.children.length > maxPhotos) list.lastElementChild.remove();
}

export function clearPhotos() {
  const list = byId("photos");
  list.replaceChildren();
  const p = document.createElement("p"); p.className = "empty";
  p.textContent = "No demonstration snapshots yet.";
  list.append(p);
}
