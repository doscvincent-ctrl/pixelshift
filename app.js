/**
 * PixelShift — app.js
 * Client-side image format converter using HTML5 Canvas API.
 * No file upload to server. 100% browser-based.
 */

'use strict';

/* ===== DOM REFS ===== */
const uploadZone      = document.getElementById('uploadZone');
const fileInput       = document.getElementById('fileInput');
const browseBtn       = document.getElementById('browseBtn');
const optionsBar      = document.getElementById('optionsBar');
const outputFormat    = document.getElementById('outputFormat');
const qualitySlider   = document.getElementById('qualitySlider');
const qualityValue    = document.getElementById('qualityValue');
const qualityGroup    = document.getElementById('qualityGroup');
const resizeWidth     = document.getElementById('resizeWidth');
const resizeHeight    = document.getElementById('resizeHeight');
const lockRatio       = document.getElementById('lockRatio');
const convertAllBtn   = document.getElementById('convertAllBtn');
const clearAllBtn     = document.getElementById('clearAllBtn');
const imageQueue      = document.getElementById('imageQueue');
const fabContainer    = document.getElementById('fabContainer');
const downloadAllZipBtn = document.getElementById('downloadAllZipBtn');
const toastContainer  = document.getElementById('toastContainer');
const bgParticles     = document.getElementById('bgParticles');

/* ===== STATE ===== */
let images = []; // Array of { id, file, origBlob, convertedBlob, convertedExt, origDims }
let nextId = 1;
let lastFocusedWidth = null; // for aspect ratio lock

/* ===== PARTICLES ===== */
function initParticles() {
  const colors = ['#00e5ff', '#bf5fff', '#7c3aed', '#06d6a0', '#ffd93d'];
  for (let i = 0; i < 35; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 1;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dur = (Math.random() * 8 + 5).toFixed(1);
    const delay = (Math.random() * 10).toFixed(1);
    const left = (Math.random() * 100).toFixed(1);
    const opacity = (Math.random() * 0.35 + 0.1).toFixed(2);
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${left}%; bottom:${Math.random() * 30}%;
      background:${color};
      --duration:${dur}s; --delay:${delay}s; --max-opacity:${opacity};
    `;
    bgParticles.appendChild(p);
  }
}
initParticles();

/* ===== QUALITY SLIDER LIVE UPDATE ===== */
qualitySlider.addEventListener('input', () => {
  const v = qualitySlider.value;
  qualityValue.textContent = v + '%';
  // update track fill
  qualitySlider.style.setProperty('--pct', v + '%');
});
qualitySlider.dispatchEvent(new Event('input'));

/* ===== FORMAT → QUALITY ENABLE/DISABLE ===== */
const lossyFormats = new Set(['image/jpeg', 'image/webp']);
outputFormat.addEventListener('change', () => {
  const lossy = lossyFormats.has(outputFormat.value);
  qualitySlider.disabled = !lossy;
  qualityGroup.style.opacity = lossy ? '1' : '0.4';
  qualityGroup.style.pointerEvents = lossy ? 'auto' : 'none';
});

outputFormat.dispatchEvent(new Event('change')); // set initial quality-slider state

/* ===== RESET WHEN SETTINGS CHANGE =====
 * Without this, an image that was already converted keeps its old result,
 * the Convert button stays hidden, and "Convert All" skips it.
 */
function resetConversions() {
  images.forEach(entry => {
    if (!entry.convertedBlob) return;
    const id = entry.id;
    entry.convertedBlob = null;
    entry.convertedExt = null;
    setBadge(id, 'ready', 'READY');
    setProgress(id, 0);
    const btn = document.getElementById(`btn-convert-${id}`);
    if (btn) { btn.style.display = ''; btn.disabled = false; btn.style.opacity = '1'; }
    const dl = document.getElementById(`btn-dl-${id}`);
    if (dl) dl.style.display = 'none';
    const meta = document.getElementById(`meta-${id}`);
    if (meta && entry.origDims) {
      meta.textContent = `${entry.origDims.w}×${entry.origDims.h} · ${formatBytes(entry.file.size)}`;
    }
  });
  updateFab();
}
[outputFormat, qualitySlider, resizeWidth, resizeHeight].forEach(el => el.addEventListener('change', resetConversions));

/* ===== ASPECT RATIO LOCK ===== */
resizeWidth.addEventListener('focus', () => { lastFocusedWidth = true; });
resizeHeight.addEventListener('focus', () => { lastFocusedWidth = false; });

function applyAspectRatio(changedAxis) {
  if (!lockRatio.checked) return;
  const img = images.find(i => i.origDims);
  if (!img) return;
  const { w, h } = img.origDims; // use last loaded dims as reference
  const ratio = w / h;
  if (changedAxis === 'width' && resizeWidth.value) {
    const newH = Math.round(parseInt(resizeWidth.value) / ratio);
    resizeHeight.value = newH > 0 ? newH : '';
  } else if (changedAxis === 'height' && resizeHeight.value) {
    const newW = Math.round(parseInt(resizeHeight.value) * ratio);
    resizeWidth.value = newW > 0 ? newW : '';
  }
}
resizeWidth.addEventListener('input', () => applyAspectRatio('width'));
resizeHeight.addEventListener('input', () => applyAspectRatio('height'));

/* ===== DRAG & DROP ===== */
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => { uploadZone.classList.remove('dragover'); });
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFiles([...e.dataTransfer.files]);
});
uploadZone.addEventListener('click', (e) => {
  if (e.target === browseBtn || browseBtn.contains(e.target)) return;
  fileInput.click();
});
browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => { handleFiles([...fileInput.files]); fileInput.value = ''; });

/* ===== KEYBOARD ACCESSIBILITY ===== */
uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });

/* ===== HANDLE FILES ===== */
function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) { showToast('No valid image files found.', 'error'); return; }
  imageFiles.forEach(addImageToQueue);
  showOptionsBar();
  scrollToQueue();
}

function showOptionsBar() {
  if (optionsBar.style.display !== 'flex') {
    optionsBar.style.display = 'flex';
  }
  updateFab();
}

function scrollToQueue() {
  setTimeout(() => {
    const converter = document.getElementById('converter');
    converter.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/* ===== ADD IMAGE TO QUEUE ===== */
function addImageToQueue(file) {
  const id = nextId++;
  const entry = { id, file, origBlob: null, convertedBlob: null, convertedExt: null, origDims: null };
  images.push(entry);

  const card = document.createElement('div');
  card.className = 'image-card';
  card.id = `card-${id}`;
  card.innerHTML = `
    <div class="card-progress"><div class="card-progress-bar" id="prog-${id}"></div></div>
    <div class="card-preview" id="preview-${id}">
      <div class="card-preview-placeholder">Loading...</div>
      <span class="card-status-badge badge-ready" id="badge-${id}">READY</span>
    </div>
    <div class="card-body">
      <div class="card-filename" id="fname-${id}" title="${escHtml(file.name)}">${escHtml(file.name)}</div>
      <div class="card-meta" id="meta-${id}">${formatBytes(file.size)}</div>
      <div class="card-actions">
        <button class="card-btn card-btn-convert" id="btn-convert-${id}" onclick="convertSingle(${id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/></svg>
          Convert
        </button>
        <button class="card-btn card-btn-download" id="btn-dl-${id}" onclick="downloadSingle(${id})" style="display:none;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/></svg>
          Download
        </button>
        <button class="card-btn card-btn-remove" id="btn-rm-${id}" onclick="removeCard(${id})" title="Remove">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;
  imageQueue.appendChild(card);

  // Load preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    entry.origBlob = dataUrl;
    const previewEl = document.getElementById(`preview-${id}`);
    previewEl.innerHTML = `
      <img src="${dataUrl}" alt="${escHtml(file.name)}" loading="lazy" />
      <span class="card-status-badge badge-ready" id="badge-${id}">READY</span>
    `;
    // Get dimensions
    const img = new Image();
    img.onload = () => {
      entry.origDims = { w: img.naturalWidth, h: img.naturalHeight };
      document.getElementById(`meta-${id}`).textContent = `${img.naturalWidth}×${img.naturalHeight} · ${formatBytes(file.size)}`;
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

/* ===== CONVERT SINGLE ===== */
async function convertSingle(id) {
  const entry = images.find(i => i.id === id);
  if (!entry || !entry.origBlob) { showToast('Image not loaded yet.', 'error'); return; }

  const format = outputFormat.value;
  const quality = parseInt(qualitySlider.value) / 100;
  const targetW = resizeWidth.value ? parseInt(resizeWidth.value) : null;
  const targetH = resizeHeight.value ? parseInt(resizeHeight.value) : null;

  setBadge(id, 'converting', 'CONVERTING...');
  setProgress(id, 20);
  const btn = document.getElementById(`btn-convert-${id}`);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  try {
    const blob = await convertImage(entry.origBlob, format, quality, targetW, targetH);
    entry.convertedBlob = blob;
    entry.convertedExt = mimeToExt(format);

    setProgress(id, 100);
    setBadge(id, 'done', 'DONE');

    const dlBtn = document.getElementById(`btn-dl-${id}`);
    if (dlBtn) dlBtn.style.display = 'flex';
    if (btn) { btn.style.display = 'none'; }

    // Update meta
    const meta = document.getElementById(`meta-${id}`);
    if (meta && entry.origDims) {
      const w = targetW || entry.origDims.w;
      const h = targetH || entry.origDims.h;
      meta.textContent = `${w}×${h} · ${formatBytes(blob.size)} · ${mimeToExt(format).toUpperCase()}`;
    }

    showToast(`Converted: ${entry.file.name}`, 'success');
    updateFab();
  } catch (err) {
    setBadge(id, 'error', 'ERROR');
    setProgress(id, 0);
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    showToast('Conversion failed: ' + err.message, 'error');
    console.error(err);
  }
}

/* ===== CONVERT IMAGE (Canvas + custom encoders) =====
 * canvas.toBlob() can only encode PNG, JPEG and (in most browsers) WebP.
 * For any other type it silently returns a PNG. So GIF, BMP, TIFF, ICO and
 * SVG are encoded by hand below.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas toBlob returned null')); return; }
      if (blob.type !== mime) { reject(new Error(`This browser can't encode ${mime}`)); return; }
      resolve(blob);
    }, mime, quality);
  });
}

async function convertImage(dataUrl, mimeType, quality, targetW, targetH) {
  const img = await loadImage(dataUrl);
  let outW = targetW || img.naturalWidth;
  let outH = targetH || img.naturalHeight;

  // ICO directory entries only hold sizes up to 256px
  if (mimeType === 'image/ico') {
    const s = Math.min(1, 256 / Math.max(outW, outH));
    outW = Math.max(1, Math.round(outW * s));
    outH = Math.max(1, Math.round(outH * s));
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // White background for formats without alpha support
  if (mimeType === 'image/jpeg' || mimeType === 'image/bmp') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.drawImage(img, 0, 0, outW, outH);

  switch (mimeType) {
    case 'image/png':
      return canvasToBlob(canvas, 'image/png');
    case 'image/jpeg':
    case 'image/webp':
      return canvasToBlob(canvas, mimeType, quality);
    case 'image/bmp':
      return encodeBMP(ctx.getImageData(0, 0, outW, outH));
    case 'image/tiff':
      return encodeTIFF(ctx.getImageData(0, 0, outW, outH));
    case 'image/gif':
      return encodeGIF(ctx.getImageData(0, 0, outW, outH));
    case 'image/ico': {
      const png = await canvasToBlob(canvas, 'image/png');
      return encodeICO(png, outW, outH);
    }
    case 'image/svg+xml':
      return encodeSVG(canvas.toDataURL('image/png'), outW, outH);
    default:
      throw new Error('Unsupported output format: ' + mimeType);
  }
}

/* ----- BMP (24-bit, uncompressed) ----- */
function encodeBMP({ width: w, height: h, data }) {
  const rowSize = (w * 3 + 3) & ~3;
  const imgSize = rowSize * h;
  const buf = new ArrayBuffer(54 + imgSize);
  const dv = new DataView(buf);
  const px = new Uint8Array(buf);
  dv.setUint8(0, 0x42); dv.setUint8(1, 0x4D);       // "BM"
  dv.setUint32(2, 54 + imgSize, true);
  dv.setUint32(10, 54, true);                        // pixel data offset
  dv.setUint32(14, 40, true);                        // DIB header size
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);                          // positive = bottom-up
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, imgSize, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[o++] = data[i + 2]; px[o++] = data[i + 1]; px[o++] = data[i];
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

/* ----- TIFF (uncompressed RGBA, little-endian) ----- */
function encodeTIFF({ width: w, height: h, data }) {
  const entries = 10;
  const ifdOffset = 8;
  const bpsOffset = ifdOffset + 2 + entries * 12 + 4;
  const dataOffset = bpsOffset + 8;
  const buf = new ArrayBuffer(dataOffset + w * h * 4);
  const dv = new DataView(buf);
  dv.setUint16(0, 0x4949, true); dv.setUint16(2, 42, true); dv.setUint32(4, ifdOffset, true);
  dv.setUint16(ifdOffset, entries, true);
  let p = ifdOffset + 2;
  const entry = (tag, type, count, value) => {
    dv.setUint16(p, tag, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) dv.setUint16(p + 8, value, true); else dv.setUint32(p + 8, value, true);
    p += 12;
  };
  entry(256, 4, 1, w);            // ImageWidth
  entry(257, 4, 1, h);            // ImageLength
  entry(258, 3, 4, bpsOffset);    // BitsPerSample
  entry(259, 3, 1, 1);            // Compression: none
  entry(262, 3, 1, 2);            // Photometric: RGB
  entry(273, 4, 1, dataOffset);   // StripOffsets
  entry(277, 3, 1, 4);            // SamplesPerPixel
  entry(278, 4, 1, h);            // RowsPerStrip
  entry(279, 4, 1, w * h * 4);    // StripByteCounts
  entry(338, 3, 1, 2);            // ExtraSamples: unassociated alpha
  dv.setUint32(p, 0, true);
  for (let i = 0; i < 4; i++) dv.setUint16(bpsOffset + i * 2, 8, true);
  new Uint8Array(buf, dataOffset).set(data);
  return new Blob([buf], { type: 'image/tiff' });
}

/* ----- ICO (single PNG-compressed image, max 256x256) ----- */
async function encodeICO(pngBlob, w, h) {
  const png = new Uint8Array(await pngBlob.arrayBuffer());
  const buf = new ArrayBuffer(22 + png.length);
  const dv = new DataView(buf);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, 1, true);
  dv.setUint8(6, w >= 256 ? 0 : w);
  dv.setUint8(7, h >= 256 ? 0 : h);
  dv.setUint16(10, 1, true);
  dv.setUint16(12, 32, true);
  dv.setUint32(14, png.length, true);
  dv.setUint32(18, 22, true);
  new Uint8Array(buf, 22).set(png);
  return new Blob([buf], { type: 'image/x-icon' });
}

/* ----- SVG (raster image embedded in an SVG wrapper) ----- */
function encodeSVG(pngDataUrl, w, h) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<image width="${w}" height="${h}" xlink:href="${pngDataUrl}" href="${pngDataUrl}"/></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/* ----- GIF (single frame, median-cut palette, LZW) ----- */
function encodeGIF({ width: w, height: h, data }) {
  const hist = new Uint32Array(32768);
  let hasTransparent = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) { hasTransparent = true; continue; }
    hist[((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)]++;
  }
  const offset = hasTransparent ? 1 : 0;
  const maxColors = 256 - offset;
  const chan = (k, c) => c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31;

  const all = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) all.push(k);
  const boxes = all.length ? [all] : [];

  while (boxes.length < maxColors) {
    let bi = -1, best = 1;
    boxes.forEach((b, i) => { if (b.length > best) { best = b.length; bi = i; } });
    if (bi < 0) break;
    const box = boxes[bi];
    const mins = [31, 31, 31], maxs = [0, 0, 0];
    for (const k of box) for (let c = 0; c < 3; c++) {
      const v = chan(k, c);
      if (v < mins[c]) mins[c] = v;
      if (v > maxs[c]) maxs[c] = v;
    }
    const ranges = maxs.map((m, c) => m - mins[c]);
    const ch = ranges.indexOf(Math.max(...ranges));
    box.sort((a, b) => chan(a, ch) - chan(b, ch));
    let total = 0;
    for (const k of box) total += hist[k];
    let acc = 0, split = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += hist[box[i]];
      split = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(bi, 1, box.slice(0, split), box.slice(split));
  }

  const palette = new Uint8Array(256 * 3);
  const lookup = new Uint8Array(32768);
  boxes.forEach((box, bi) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const k of box) {
      const cnt = hist[k];
      const rr = chan(k, 0), gg = chan(k, 1), bb = chan(k, 2);
      r += ((rr << 3) | (rr >> 2)) * cnt;
      g += ((gg << 3) | (gg >> 2)) * cnt;
      b += ((bb << 3) | (bb >> 2)) * cnt;
      n += cnt;
      lookup[k] = bi + offset;
    }
    const pi = (bi + offset) * 3;
    palette[pi] = Math.round(r / n); palette[pi + 1] = Math.round(g / n); palette[pi + 2] = Math.round(b / n);
  });

  const indices = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    indices[j] = data[i + 3] < 128
      ? 0
      : lookup[((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)];
  }

  const out = [];
  const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);   // "GIF89a"
  u16(w); u16(h);
  out.push(0xF7, 0, 0);                            // 256-colour global table
  for (let i = 0; i < palette.length; i++) out.push(palette[i]);
  if (hasTransparent) out.push(0x21, 0xF9, 0x04, 0x05, 0, 0, 0, 0);
  out.push(0x2C); u16(0); u16(0); u16(w); u16(h); out.push(0);
  out.push(8);                                     // LZW min code size
  const lzw = lzwEncode(indices, 8);
  for (let i = 0; i < lzw.length; i += 255) {
    const chunk = lzw.slice(i, i + 255);
    out.push(chunk.length);
    for (let j = 0; j < chunk.length; j++) out.push(chunk[j]);
  }
  out.push(0, 0x3B);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

function lzwEncode(pixels, minCodeSize) {
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let codeSize = minCodeSize + 1, next = eoi + 1;
  let dict = new Map();
  const out = [];
  let cur = 0, bits = 0;
  const emit = (code) => {
    cur |= code << bits; bits += codeSize;
    while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}

/* ===== CONVERT ALL ===== */
window.convertAll = async function() {
  const pending = images.filter(i => !i.convertedBlob);
  if (pending.length === 0) { showToast('All images already converted!', 'info'); return; }
  showToast(`Converting ${pending.length} image${pending.length > 1 ? 's' : ''}...`, 'info');
  for (const entry of pending) {
    await convertSingle(entry.id);
  }
};
convertAllBtn.addEventListener('click', window.convertAll);

/* ===== DOWNLOAD SINGLE ===== */
window.downloadSingle = function(id) {
  const entry = images.find(i => i.id === id);
  if (!entry || !entry.convertedBlob) { showToast('Convert the image first!', 'error'); return; }
  const url = URL.createObjectURL(entry.convertedBlob);
  const baseName = stripExt(entry.file.name);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}_pixelshift.${entry.convertedExt}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast('Downloaded!', 'success');
};

/* ===== DOWNLOAD ALL AS ZIP ===== */
downloadAllZipBtn.addEventListener('click', async () => {
  const converted = images.filter(i => i.convertedBlob);
  if (converted.length === 0) { showToast('No converted images to download yet!', 'error'); return; }
  if (typeof JSZip === 'undefined') { showToast('ZIP library not loaded. Try downloading individually.', 'error'); return; }

  showToast(`Zipping ${converted.length} files...`, 'info');
  downloadAllZipBtn.disabled = true;

  try {
    const zip = new JSZip();
    converted.forEach(entry => {
      const baseName = stripExt(entry.file.name);
      zip.file(`${baseName}_pixelshift.${entry.convertedExt}`, entry.convertedBlob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixelshift_converted_${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('ZIP downloaded!', 'success');
  } catch (err) {
    showToast('ZIP creation failed: ' + err.message, 'error');
    console.error(err);
  } finally {
    downloadAllZipBtn.disabled = false;
  }
});

/* ===== REMOVE CARD ===== */
window.removeCard = function(id) {
  images = images.filter(i => i.id !== id);
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.style.transform = 'scale(0.9)';
    card.style.opacity = '0';
    card.style.transition = 'all 0.25s ease';
    setTimeout(() => card.remove(), 250);
  }
  if (images.length === 0) {
    optionsBar.style.display = 'none';
    fabContainer.style.display = 'none';
  }
  updateFab();
};

/* ===== CLEAR ALL ===== */
clearAllBtn.addEventListener('click', () => {
  images = [];
  imageQueue.innerHTML = '';
  optionsBar.style.display = 'none';
  fabContainer.style.display = 'none';
  showToast('Cleared all images.', 'info');
});

/* ===== HELPERS ===== */
function setBadge(id, type, text) {
  const badge = document.getElementById(`badge-${id}`);
  if (!badge) return;
  badge.className = `card-status-badge badge-${type}`;
  badge.textContent = text;
}

function setProgress(id, pct) {
  const bar = document.getElementById(`prog-${id}`);
  if (bar) bar.style.width = pct + '%';
}

function updateFab() {
  const hasConverted = images.some(i => i.convertedBlob);
  fabContainer.style.display = hasConverted ? 'block' : 'none';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function mimeToExt(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/ico': 'ico',
    'image/svg+xml': 'svg'
  };
  return map[mime] || 'png';
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ===== TOAST ===== */
function showToast(message, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${escHtml(message)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'scale(0.9)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ===== FAQ ACCORDION ===== */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ===== SMOOTH SCROLL NAV ACTIVE STATE ===== */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
      if (link) link.classList.add('active');
    }
  });
}, { threshold: 0.3 });
sections.forEach(s => observer.observe(s));

/* ===== SCROLL REVEAL (Intersection Observer) ===== */
const revealEls = document.querySelectorAll('.feature-card, .format-card, .faq-item');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

revealEls.forEach((el, idx) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = `opacity 0.5s ease ${idx * 0.05}s, transform 0.5s ease ${idx * 0.05}s`;
  revealObserver.observe(el);
});

/* ===== GLOBAL PASTE SUPPORT ===== */
document.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])];
  const imageItems = items.filter(i => i.type.startsWith('image/'));
  if (imageItems.length === 0) return;
  const files = imageItems.map(i => i.getAsFile()).filter(Boolean);
  if (files.length > 0) {
    handleFiles(files);
    showToast(`Pasted ${files.length} image${files.length > 1 ? 's' : ''}`, 'info');
  }
});

console.log('%c PixelShift ', 'background:#7c3aed;color:#fff;font-size:18px;padding:6px 12px;border-radius:6px;font-weight:bold;', '— Image Converter Loaded');