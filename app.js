const els = {
  dropZone: document.querySelector('#dropZone'),
  fileInput: document.querySelector('#fileInput'),
  converter: document.querySelector('#converter'),
  fileList: document.querySelector('#fileList'),
  fileCount: document.querySelector('#fileCount'),
  addFilesButton: document.querySelector('#addFilesButton'),
  formatOptions: document.querySelector('#formatOptions'),
  scaleSelect: document.querySelector('#scaleSelect'),
  qualityRow: document.querySelector('#qualityRow'),
  qualityRange: document.querySelector('#qualityRange'),
  qualityValue: document.querySelector('#qualityValue'),
  backgroundRow: document.querySelector('#backgroundRow'),
  backgroundColor: document.querySelector('#backgroundColor'),
  backgroundValue: document.querySelector('#backgroundValue'),
  convertButton: document.querySelector('#convertButton'),
  downloadAllButton: document.querySelector('#downloadAllButton'),
  toast: document.querySelector('#toast')
};

const supportedExtensions = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];
const SVG_BASE_SCALE = 4;
const MAX_CANVAS_PIXELS = 100_000_000;
const MAX_CANVAS_DIMENSION = 32_767;
const state = { files: [], outputType: 'image/png', busy: false };
const icons = {
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"/></svg>'
};

function extensionOf(name) { return name.split('.').pop().toLowerCase(); }
function baseName(name) { return name.replace(/\.[^.]+$/, ''); }
function isSvgFile(file) { return file.type === 'image/svg+xml' || extensionOf(file.name) === 'svg'; }
function outputExtension() { return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[state.outputType]; }
function prettyBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2300);
}

function isSupported(file) {
  return file.type.startsWith('image/') || supportedExtensions.includes(extensionOf(file.name));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('브라우저에서 이 이미지를 읽을 수 없습니다.'));
    image.src = url;
  });
}

async function addFiles(fileList) {
  const incoming = Array.from(fileList);
  const valid = incoming.filter(isSupported);
  if (!valid.length) {
    showToast('지원하는 이미지 파일을 선택해 주세요.');
    return;
  }

  if (valid.length !== incoming.length) showToast('지원하지 않는 파일은 제외했어요.');
  for (const file of valid) {
    const sourceUrl = URL.createObjectURL(file);
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file, sourceUrl, width: 0, height: 0, outputWidth: 0, outputHeight: 0,
      status: 'loading', resultUrl: null, resultBlob: null, error: null
    };
    state.files.push(item);
    try {
      const image = await loadImage(sourceUrl);
      item.width = image.naturalWidth || image.width;
      item.height = image.naturalHeight || image.height;
      if (!item.width || !item.height) throw new Error('이미지 크기를 확인할 수 없습니다.');
      item.status = 'ready';
    } catch (error) {
      item.status = 'error';
      item.error = error.message;
    }
  }
  els.fileInput.value = '';
  render();
  els.dropZone.hidden = true;
  els.converter.hidden = false;
}

function clearResult(item) {
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  item.resultUrl = null;
  item.resultBlob = null;
  item.outputWidth = 0;
  item.outputHeight = 0;
  if (item.width && item.height) {
    item.status = 'ready';
    item.error = null;
  }
}

function invalidateResults() {
  state.files.forEach(clearResult);
  els.downloadAllButton.hidden = true;
  render();
}

function removeFile(id) {
  const index = state.files.findIndex(item => item.id === id);
  if (index < 0) return;
  const [item] = state.files.splice(index, 1);
  URL.revokeObjectURL(item.sourceUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  if (!state.files.length) {
    els.converter.hidden = true;
    els.dropZone.hidden = false;
  }
  render();
}

function statusLabel(item) {
  if (item.status === 'loading') return ['읽는 중', ''];
  if (item.status === 'converting') return ['변환 중', ''];
  if (item.status === 'done') return ['변환 완료', 'done'];
  if (item.status === 'error') return [item.error || '오류', 'error'];
  return ['준비됨', ''];
}

function render() {
  els.fileCount.textContent = state.files.length;
  els.fileList.innerHTML = '';
  state.files.forEach(item => {
    const [label, statusClass] = statusLabel(item);
    const row = document.createElement('div');
    row.className = 'file-item';
    row.innerHTML = `
      <img class="thumbnail" src="${item.sourceUrl}" alt="">
      <div class="file-info">
        <strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong>
        <div class="file-meta"><span>${prettyBytes(item.file.size)}</span><span>·</span><span>${item.width ? `${item.width} × ${item.height}` : '크기 확인 중'}</span>${item.resultBlob ? `<span>→</span><span>${item.outputWidth} × ${item.outputHeight}</span><span>·</span><span>${prettyBytes(item.resultBlob.size)} ${outputExtension().toUpperCase()}</span>` : ''}<span>·</span><span class="file-status ${statusClass}">${escapeHtml(label)}</span></div>
      </div>
      <div class="item-actions">
        ${item.status === 'done' ? `<button class="icon-button download" data-download="${item.id}" title="다운로드" aria-label="${escapeHtml(item.file.name)} 다운로드">${icons.download}</button>` : ''}
        <button class="icon-button" data-remove="${item.id}" title="목록에서 제거" aria-label="${escapeHtml(item.file.name)} 제거">${icons.trash}</button>
      </div>`;
    els.fileList.append(row);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('이미지를 만들 수 없습니다.'));
      if (blob.type && blob.type !== type) return reject(new Error('이 브라우저가 선택한 출력 포맷을 지원하지 않습니다.'));
      resolve(blob);
    }, type, quality);
  });
}

async function convertItem(item) {
  item.status = 'converting';
  render();
  const image = await loadImage(item.sourceUrl);
  const selectedScale = Number(els.scaleSelect.value);
  const scale = selectedScale * (isSvgFile(item.file) ? SVG_BASE_SCALE : 1);
  const width = Math.round(item.width * scale);
  const height = Math.round(item.height * scale);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('유효한 출력 크기를 계산할 수 없습니다.');
  }
  if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION || width * height > MAX_CANVAS_PIXELS) {
    throw new Error('출력 이미지가 너무 큽니다. 배율을 낮춰 주세요.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이 브라우저에서 이미지 캔버스를 만들 수 없습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (state.outputType === 'image/jpeg') {
    context.fillStyle = els.backgroundColor.value;
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  const quality = Number(els.qualityRange.value) / 100;
  item.resultBlob = await canvasToBlob(canvas, state.outputType, quality);
  item.outputWidth = width;
  item.outputHeight = height;
  item.resultUrl = URL.createObjectURL(item.resultBlob);
  item.status = 'done';
}

async function convertAll() {
  if (state.busy) return;
  state.files.forEach(clearResult);
  const candidates = state.files.filter(item => item.status !== 'error');
  if (!candidates.length) return showToast('변환할 수 있는 파일이 없습니다.');
  state.busy = true;
  els.convertButton.disabled = true;
  els.convertButton.querySelector('span').textContent = '변환하는 중…';
  let completed = 0;
  for (const item of candidates) {
    try {
      await convertItem(item);
      completed += 1;
    } catch (error) {
      item.status = 'error';
      item.error = error.message;
    }
    render();
  }
  state.busy = false;
  els.convertButton.disabled = false;
  els.convertButton.querySelector('span').textContent = '다시 변환하기';
  els.downloadAllButton.hidden = completed < 2;
  showToast(`${completed}개 파일 변환이 완료됐어요.`);
}

function downloadItem(item) {
  if (!item?.resultUrl) return;
  const anchor = document.createElement('a');
  anchor.href = item.resultUrl;
  anchor.download = `${baseName(item.file.name)}.${outputExtension()}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function downloadAll() {
  const done = state.files.filter(item => item.status === 'done');
  for (const item of done) {
    downloadItem(item);
    await new Promise(resolve => setTimeout(resolve, 140));
  }
  showToast(`${done.length}개 파일 다운로드를 시작했어요.`);
}

els.dropZone.addEventListener('click', () => els.fileInput.click());
els.dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); els.fileInput.click(); }
});
els.fileInput.addEventListener('change', event => addFiles(event.target.files));
els.addFilesButton.addEventListener('click', () => els.fileInput.click());

['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => {
  event.preventDefault();
  els.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => {
  event.preventDefault();
  els.dropZone.classList.remove('dragging');
}));
els.dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));

els.formatOptions.addEventListener('click', event => {
  const button = event.target.closest('[data-format]');
  if (!button || state.busy) return;
  state.outputType = button.dataset.format;
  els.formatOptions.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
  els.qualityRow.hidden = state.outputType === 'image/png';
  els.backgroundRow.hidden = state.outputType !== 'image/jpeg';
  invalidateResults();
});
els.scaleSelect.addEventListener('change', invalidateResults);
els.qualityRange.addEventListener('input', () => {
  els.qualityValue.textContent = `${els.qualityRange.value}%`;
  invalidateResults();
});
els.backgroundColor.addEventListener('input', () => {
  els.backgroundValue.textContent = els.backgroundColor.value.toUpperCase();
  invalidateResults();
});
els.fileList.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  const download = event.target.closest('[data-download]');
  if (remove && !state.busy) removeFile(remove.dataset.remove);
  if (download) downloadItem(state.files.find(item => item.id === download.dataset.download));
});
els.convertButton.addEventListener('click', convertAll);
els.downloadAllButton.addEventListener('click', downloadAll);

window.addEventListener('beforeunload', () => state.files.forEach(item => {
  URL.revokeObjectURL(item.sourceUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}));
