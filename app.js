const els = {
  dropZone: document.querySelector('#dropZone'),
  fileInput: document.querySelector('#fileInput'),
  converter: document.querySelector('#converter'),
  fileList: document.querySelector('#fileList'),
  fileCount: document.querySelector('#fileCount'),
  addFilesButton: document.querySelector('#addFilesButton'),
  formatOptions: document.querySelector('#formatOptions'),
  scaleRow: document.querySelector('#scaleRow'),
  scaleSelect: document.querySelector('#scaleSelect'),
  scaleNote: document.querySelector('#scaleNote'),
  qualityRow: document.querySelector('#qualityRow'),
  qualityRange: document.querySelector('#qualityRange'),
  qualityValue: document.querySelector('#qualityValue'),
  backgroundRow: document.querySelector('#backgroundRow'),
  backgroundColor: document.querySelector('#backgroundColor'),
  backgroundValue: document.querySelector('#backgroundValue'),
  outputHint: document.querySelector('#outputHint'),
  queueNote: document.querySelector('#queueNote'),
  convertButton: document.querySelector('#convertButton'),
  downloadAllButton: document.querySelector('#downloadAllButton'),
  toast: document.querySelector('#toast')
};

const supportedExtensions = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'pdf'];
const SVG_BASE_SCALE = 4;
const PDF_BASE_SCALE = 2;
const MAX_CANVAS_PIXELS = 100_000_000;
const MAX_CANVAS_DIMENSION = 32_767;
const MAX_PDF_PAGE_POINTS = 14_400;
const PDF_ASSET_OPTIONS = {
  cMapUrl: './vendor/pdfjs/cmaps/',
  cMapPacked: true,
  iccUrl: './vendor/pdfjs/iccs/',
  standardFontDataUrl: './vendor/pdfjs/standard_fonts/',
  wasmUrl: './vendor/pdfjs/wasm/',
  isEvalSupported: false,
  stopAtErrors: false
};
const state = { files: [], outputType: 'image/png', busy: false, combinedPdf: null };
let documentDragDepth = 0;
const icons = {
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"/></svg>',
  zip: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7zM14 3v5h5M10 7h3m-3 3h3m-3 3h3m-3 3h3v3h-3z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m7 14 5-5 5 5"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>'
};

let pdfjsPromise = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('./vendor/pdfjs/pdf.min.js')
      .then(module => {
        const pdfjs = module.GlobalWorkerOptions ? module : window.pdfjsLib;
        requireLibrary(pdfjs, 'PDF.js');
        pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';
        return pdfjs;
      })
      .catch(error => {
        pdfjsPromise = null;
        throw new Error(`PDF 기능을 불러오지 못했습니다. 로컬 서버로 실행해 주세요. (${error.message})`);
      });
  }
  return pdfjsPromise;
}

async function destroyPdfLoadingTask(loadingTask, documentProxy) {
  if (loadingTask && typeof loadingTask.destroy === 'function') {
    await loadingTask.destroy();
    return;
  }
  if (documentProxy && typeof documentProxy.cleanup === 'function') {
    await documentProxy.cleanup();
  }
}

function extensionOf(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }
function baseName(name) { return name.replace(/\.[^.]+$/, ''); }
function isPdfFile(file) { return file.type === 'application/pdf' || extensionOf(file.name) === 'pdf'; }
function isSvgFile(file) { return file.type === 'image/svg+xml' || extensionOf(file.name) === 'svg'; }
function isPdfOutput() { return state.outputType === 'application/pdf'; }
function outputExtension() {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' }[state.outputType];
}
function prettyBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function isSupported(file) {
  return isPdfFile(file) || file.type.startsWith('image/') || supportedExtensions.includes(extensionOf(file.name));
}

function requireLibrary(value, label) {
  if (!value) throw new Error(`${label} 라이브러리를 불러오지 못했습니다. 페이지를 새로고침해 주세요.`);
  return value;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('브라우저에서 이 이미지를 읽을 수 없습니다.'));
    image.src = url;
  });
}

async function readPdfMetadata(file) {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    ...PDF_ASSET_OPTIONS
  });
  let documentProxy;
  try {
    documentProxy = await loadingTask.promise;
    const firstPage = await documentProxy.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    firstPage.cleanup();
    return {
      pageCount: documentProxy.numPages,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height)
    };
  } finally {
    await destroyPdfLoadingTask(loadingTask, documentProxy);
  }
}

async function addFiles(fileList) {
  const incoming = Array.from(fileList);
  const valid = incoming.filter(isSupported);
  if (!valid.length) {
    showToast('지원하는 이미지 또는 PDF 파일을 선택해 주세요.');
    return;
  }

  if (valid.length !== incoming.length) showToast('지원하지 않는 파일은 목록에서 제외했습니다.');
  invalidateResults(false);
  for (const file of valid) {
    const sourceUrl = URL.createObjectURL(file);
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      kind: isPdfFile(file) ? 'pdf' : 'image',
      sourceUrl,
      width: 0,
      height: 0,
      pageCount: 0,
      status: 'loading',
      results: [],
      error: null,
      loadError: null
    };
    state.files.push(item);
    render();
    try {
      if (item.kind === 'pdf') {
        Object.assign(item, await readPdfMetadata(file));
      } else {
        const image = await loadImage(sourceUrl);
        item.width = image.naturalWidth || image.width;
        item.height = image.naturalHeight || image.height;
        if (!item.width || !item.height) throw new Error('이미지 크기를 확인할 수 없습니다.');
      }
      item.status = 'ready';
    } catch (error) {
      item.status = 'error';
      item.error = error.message;
      item.loadError = error.message;
    }
  }
  els.fileInput.value = '';
  els.dropZone.hidden = true;
  els.converter.hidden = false;
  render();
}

function revokeResults(item) {
  item.results.forEach(result => URL.revokeObjectURL(result.url));
  item.results = [];
  item.error = item.loadError;
  item.status = item.loadError ? 'error' : 'ready';
}

function clearCombinedPdf() {
  if (state.combinedPdf?.url) URL.revokeObjectURL(state.combinedPdf.url);
  state.combinedPdf = null;
}

function invalidateResults(shouldRender = true) {
  state.files.forEach(revokeResults);
  clearCombinedPdf();
  els.downloadAllButton.hidden = true;
  if (shouldRender) render();
}

function removeFile(id) {
  const index = state.files.findIndex(item => item.id === id);
  if (index < 0) return;
  invalidateResults(false);
  const [item] = state.files.splice(index, 1);
  URL.revokeObjectURL(item.sourceUrl);
  if (!state.files.length) {
    els.converter.hidden = true;
    els.dropZone.hidden = false;
  }
  render();
}

function moveFile(id, delta) {
  const index = state.files.findIndex(item => item.id === id);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.files.length) return;
  invalidateResults(false);
  const [item] = state.files.splice(index, 1);
  state.files.splice(nextIndex, 0, item);
  render();
}

function incompatibilityMessage(item) {
  return isPdfOutput() && item.kind === 'pdf' ? 'PDF 출력에는 이미지 파일만 사용할 수 있습니다.' : null;
}

function statusLabel(item) {
  const incompatible = incompatibilityMessage(item);
  if (incompatible) return [incompatible, 'error'];
  if (item.status === 'loading') return ['읽는 중', ''];
  if (item.status === 'converting') return ['변환 중', ''];
  if (item.status === 'done') return ['변환 완료', 'done'];
  if (item.status === 'error') return [item.error || '오류', 'error'];
  return ['준비됨', ''];
}

function resultSummary(item) {
  if (!item.results.length) return '';
  const bytes = item.results.reduce((sum, result) => sum + result.blob.size, 0);
  const count = item.results.length;
  return `<span>→</span><span>${count > 1 ? `${count}개 ` : ''}${outputExtension().toUpperCase()}</span><span>·</span><span>${prettyBytes(bytes)}</span>`;
}

function render() {
  els.fileCount.textContent = state.files.length;
  els.fileList.innerHTML = '';
  state.files.forEach((item, index) => {
    const [label, statusClass] = statusLabel(item);
    const sourceMeta = item.kind === 'pdf'
      ? `${item.pageCount ? `${item.pageCount}페이지` : '페이지 확인 중'}${item.width ? ` · ${item.width} × ${item.height} pt` : ''}`
      : (item.width ? `${item.width} × ${item.height}` : '크기 확인 중');
    const thumbnail = item.kind === 'pdf'
      ? '<div class="thumbnail pdf-thumbnail" aria-hidden="true"><span>PDF</span></div>'
      : `<img class="thumbnail" src="${item.sourceUrl}" alt="">`;
    const downloadActions = !isPdfOutput() && item.status === 'done'
      ? `${item.results.length > 1 ? `<button class="icon-button" data-zip="${item.id}" title="ZIP 다운로드" aria-label="${escapeHtml(item.file.name)} ZIP 다운로드">${icons.zip}</button>` : ''}<button class="icon-button download" data-download="${item.id}" title="${item.results.length > 1 ? '페이지별 이미지 다운로드' : '다운로드'}" aria-label="${escapeHtml(item.file.name)} 다운로드">${icons.download}</button>`
      : '';
    const row = document.createElement('div');
    row.className = 'file-item';
    row.innerHTML = `
      ${thumbnail}
      <div class="file-info">
        <strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong>
        <div class="file-meta"><span>${prettyBytes(item.file.size)}</span><span>·</span><span>${sourceMeta}</span>${resultSummary(item)}<span>·</span><span class="file-status ${statusClass}">${escapeHtml(label)}</span></div>
      </div>
      <div class="item-actions">
        <div class="order-buttons" aria-label="파일 순서 변경">
          <button class="icon-button order" data-move="-1" data-id="${item.id}" title="위로 이동" aria-label="${escapeHtml(item.file.name)} 위로 이동" ${index === 0 ? 'disabled' : ''}>${icons.up}</button>
          <button class="icon-button order" data-move="1" data-id="${item.id}" title="아래로 이동" aria-label="${escapeHtml(item.file.name)} 아래로 이동" ${index === state.files.length - 1 ? 'disabled' : ''}>${icons.down}</button>
        </div>
        ${downloadActions}
        <button class="icon-button" data-remove="${item.id}" title="목록에서 제거" aria-label="${escapeHtml(item.file.name)} 제거">${icons.trash}</button>
      </div>`;
    els.fileList.append(row);
  });
  updateSettingsView();
}

function updateSettingsView() {
  const pdfOutput = isPdfOutput();
  els.scaleRow.hidden = pdfOutput;
  els.qualityRow.hidden = state.outputType === 'image/png';
  els.backgroundRow.hidden = !(state.outputType === 'image/jpeg' || pdfOutput);
  els.scaleNote.textContent = state.files.some(item => item.kind === 'pdf')
    ? 'PDF는 1× 기준 144 DPI이며, 배율을 높이면 페이지 이미지가 더 선명하고 커집니다.'
    : 'SVG는 선명도를 위해 1×부터 논리 크기의 4배 픽셀로 출력됩니다.';
  els.outputHint.textContent = pdfOutput
    ? '이미지는 목록 순서대로 하나의 다중 페이지 PDF에 들어갑니다.'
    : 'PDF는 페이지마다 별도의 이미지로 변환되며 ZIP으로 한 번에 받을 수 있습니다.';
  els.queueNote.hidden = false;
  els.queueNote.textContent = pdfOutput
    ? '파일을 여기에 드래그해 추가하세요. 현재 목록 순서가 PDF 페이지 순서가 됩니다.'
    : '파일을 여기에 드래그하면 현재 목록에 계속 추가됩니다.';
  if (state.combinedPdf) {
    els.downloadAllButton.textContent = `PDF 다운로드 · ${prettyBytes(state.combinedPdf.blob.size)}`;
  } else {
    els.downloadAllButton.textContent = '모두 ZIP으로 다운로드';
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('출력 파일을 만들 수 없습니다.'));
      if (blob.type && blob.type !== type) return reject(new Error('이 브라우저는 선택한 출력 포맷을 지원하지 않습니다.'));
      resolve(blob);
    }, type, quality);
  });
}

function validateCanvasSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('유효한 출력 크기를 계산할 수 없습니다.');
  }
  if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION || width * height > MAX_CANVAS_PIXELS) {
    throw new Error('출력 이미지가 너무 큽니다. 배율을 낮춰 주세요.');
  }
}

function createCanvas(width, height, fillColor = null) {
  validateCanvasSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('브라우저에서 이미지 캔버스를 만들 수 없습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (fillColor) {
    context.fillStyle = fillColor;
    context.fillRect(0, 0, width, height);
  }
  return { canvas, context };
}

function addResult(item, blob, fileName, width, height, label = '') {
  item.results.push({ blob, fileName, width, height, label, url: URL.createObjectURL(blob) });
}

async function convertImageToImage(item) {
  const image = await loadImage(item.sourceUrl);
  const selectedScale = Number(els.scaleSelect.value);
  const scale = selectedScale * (isSvgFile(item.file) ? SVG_BASE_SCALE : 1);
  const width = Math.round(item.width * scale);
  const height = Math.round(item.height * scale);
  const fill = state.outputType === 'image/jpeg' ? els.backgroundColor.value : null;
  const { canvas, context } = createCanvas(width, height, fill);
  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, state.outputType, Number(els.qualityRange.value) / 100);
  addResult(item, blob, `${baseName(item.file.name)}.${outputExtension()}`, width, height);
}

async function convertPdfToImages(item) {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await item.file.arrayBuffer()),
    ...PDF_ASSET_OPTIONS
  });
  let documentProxy;
  try {
    documentProxy = await loadingTask.promise;
    const padLength = Math.max(2, String(documentProxy.numPages).length);
    const renderScale = Number(els.scaleSelect.value) * PDF_BASE_SCALE;
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const viewport = page.getViewport({ scale: renderScale });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);
      const { canvas, context } = createCanvas(width, height, '#ffffff');
      await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
      const blob = await canvasToBlob(canvas, state.outputType, Number(els.qualityRange.value) / 100);
      const suffix = String(pageNumber).padStart(padLength, '0');
      addResult(item, blob, `${baseName(item.file.name)}_page-${suffix}.${outputExtension()}`, width, height, `${pageNumber}페이지`);
      page.cleanup();
      render();
    }
  } finally {
    await destroyPdfLoadingTask(loadingTask, documentProxy);
  }
}

async function convertItemToImages(item) {
  item.status = 'converting';
  render();
  if (item.kind === 'pdf') await convertPdfToImages(item);
  else await convertImageToImage(item);
  item.status = 'done';
}

function fitPdfPage(width, height) {
  const scale = Math.min(1, MAX_PDF_PAGE_POINTS / Math.max(width, height));
  return { width: Math.max(3, width * scale), height: Math.max(3, height * scale) };
}

function drawImageForPdf(item, image) {
  const rasterScale = isSvgFile(item.file) ? SVG_BASE_SCALE : 1;
  let width = Math.round(item.width * rasterScale);
  let height = Math.round(item.height * rasterScale);
  const dimensionScale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(width, height));
  const pixelScale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
  const safeScale = Math.min(dimensionScale, pixelScale);
  width = Math.max(1, Math.floor(width * safeScale));
  height = Math.max(1, Math.floor(height * safeScale));
  const { canvas, context } = createCanvas(width, height, els.backgroundColor.value);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', Number(els.qualityRange.value) / 100);
}

function addPdfImagePage(pdf, dataUrl, logicalWidth, logicalHeight, isFirstPage) {
  const desired = fitPdfPage(logicalWidth * 0.75, logicalHeight * 0.75);
  const orientation = desired.width > desired.height ? 'landscape' : 'portrait';
  if (!isFirstPage) pdf.addPage([desired.width, desired.height], orientation);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
}

async function validateGeneratedPdf(blob, expectedPageCount) {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    ...PDF_ASSET_OPTIONS
  });
  let documentProxy;
  try {
    documentProxy = await loadingTask.promise;
    if (documentProxy.numPages !== expectedPageCount) {
      throw new Error(`생성된 PDF 페이지 수가 예상과 다릅니다. (${documentProxy.numPages}/${expectedPageCount})`);
    }
    return documentProxy.numPages;
  } finally {
    await destroyPdfLoadingTask(loadingTask, documentProxy);
  }
}

async function convertImagesToPdf(candidates) {
  const JsPdf = requireLibrary(window.jspdf?.jsPDF, 'jsPDF');
  let pdf = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    item.status = 'converting';
    render();
    try {
      const image = await loadImage(item.sourceUrl);
      const dataUrl = drawImageForPdf(item, image);
      const desired = fitPdfPage(item.width * 0.75, item.height * 0.75);
      if (!pdf) {
        pdf = new JsPdf({
          orientation: desired.width > desired.height ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [desired.width, desired.height],
          compress: true,
          putOnlyUsedFonts: true
        });
      }
      addPdfImagePage(pdf, dataUrl, item.width, item.height, index === 0);
      item.status = 'done';
    } catch (error) {
      item.status = 'error';
      item.error = error.message;
      throw error;
    }
  }
  if (!pdf) throw new Error('PDF에 넣을 이미지가 없습니다.');
  if (pdf.getNumberOfPages() !== candidates.length) {
    throw new Error('PDF 페이지를 모두 추가하지 못했습니다.');
  }
  const blob = pdf.output('blob');
  const pageCount = await validateGeneratedPdf(blob, candidates.length);
  const fileName = candidates.length === 1
    ? `${baseName(candidates[0].file.name)}.pdf`
    : `formatdrop-${candidates.length}-images.pdf`;
  state.combinedPdf = { blob, fileName, url: URL.createObjectURL(blob), pageCount };
}

async function convertAll() {
  if (state.busy) return;
  invalidateResults(false);
  const candidates = state.files.filter(item => !item.loadError && !incompatibilityMessage(item));
  if (!candidates.length) {
    render();
    return showToast(isPdfOutput() ? 'PDF로 만들 이미지 파일을 추가해 주세요.' : '변환할 수 있는 파일이 없습니다.');
  }

  state.busy = true;
  els.convertButton.disabled = true;
  els.convertButton.querySelector('span').textContent = '변환하는 중…';
  let completed = 0;
  try {
    if (isPdfOutput()) {
      await convertImagesToPdf(candidates);
      completed = candidates.length;
    } else {
      for (const item of candidates) {
        try {
          await convertItemToImages(item);
          completed += 1;
        } catch (error) {
          revokeResults(item);
          item.status = 'error';
          item.error = error.message;
        }
        render();
      }
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.busy = false;
    els.convertButton.disabled = false;
    els.convertButton.querySelector('span').textContent = completed ? '다시 변환하기' : '모두 변환하기';
    const resultCount = state.files.reduce((sum, item) => sum + item.results.length, 0);
    els.downloadAllButton.hidden = isPdfOutput() ? !state.combinedPdf : resultCount < 2;
    render();
  }
  if (completed) {
    showToast(isPdfOutput()
      ? `${completed}개 이미지를 ${completed}페이지 PDF로 만들었습니다.`
      : `${completed}개 파일의 변환이 완료되었습니다.`);
  }
}

function triggerDownload(url, fileName) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function downloadItem(item) {
  if (!item?.results.length) return;
  for (const result of item.results) {
    triggerDownload(result.url, result.fileName);
    await new Promise(resolve => setTimeout(resolve, 160));
  }
  if (item.results.length > 1) showToast(`${item.results.length}개 페이지 이미지 다운로드를 시작했습니다.`);
}

function uniqueFileName(fileName, usedNames) {
  let candidate = fileName;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const extension = extensionOf(fileName);
    const stem = baseName(fileName);
    candidate = `${stem}-${index}.${extension}`;
    index += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function createZip(results, zipName) {
  const Zip = requireLibrary(window.JSZip, 'JSZip');
  const zip = new Zip();
  const usedNames = new Set();
  results.forEach(result => zip.file(uniqueFileName(result.fileName, usedNames), result.blob));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, zipName);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadItemZip(item) {
  if (!item?.results.length) return;
  await createZip(item.results, `${baseName(item.file.name)}-pages.zip`);
  showToast(`${item.results.length}개 페이지를 ZIP으로 묶었습니다.`);
}

async function downloadAll() {
  if (state.combinedPdf && isPdfOutput()) {
    triggerDownload(state.combinedPdf.url, state.combinedPdf.fileName);
    return;
  }
  const results = state.files.flatMap(item => item.results);
  if (!results.length) return;
  if (results.length === 1) {
    triggerDownload(results[0].url, results[0].fileName);
    return;
  }
  const previousText = els.downloadAllButton.textContent;
  els.downloadAllButton.disabled = true;
  els.downloadAllButton.textContent = 'ZIP 만드는 중…';
  try {
    await createZip(results, `formatdrop-${results.length}-files.zip`);
    showToast(`${results.length}개 파일을 ZIP으로 묶었습니다.`);
  } finally {
    els.downloadAllButton.disabled = false;
    els.downloadAllButton.textContent = previousText;
  }
}

els.dropZone.addEventListener('click', () => els.fileInput.click());
els.dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    els.fileInput.click();
  }
});
els.fileInput.addEventListener('change', event => addFiles(event.target.files));
els.addFilesButton.addEventListener('click', () => els.fileInput.click());

function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function clearDocumentDragState() {
  documentDragDepth = 0;
  els.converter.classList.remove('dragging-files');
}

['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => {
  event.preventDefault();
  event.stopPropagation();
  els.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => {
  event.preventDefault();
  event.stopPropagation();
  els.dropZone.classList.remove('dragging');
}));
els.dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));

document.addEventListener('dragenter', event => {
  if (!state.files.length || !hasDraggedFiles(event)) return;
  event.preventDefault();
  documentDragDepth += 1;
  els.converter.classList.add('dragging-files');
});
document.addEventListener('dragover', event => {
  if (!state.files.length || !hasDraggedFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  els.converter.classList.add('dragging-files');
});
document.addEventListener('dragleave', event => {
  if (!state.files.length || !hasDraggedFiles(event)) return;
  documentDragDepth = Math.max(0, documentDragDepth - 1);
  if (!documentDragDepth) els.converter.classList.remove('dragging-files');
});
document.addEventListener('drop', event => {
  if (!state.files.length || !hasDraggedFiles(event)) return;
  event.preventDefault();
  clearDocumentDragState();
  if (state.busy) {
    showToast('변환이 끝난 뒤 파일을 추가해 주세요.');
    return;
  }
  addFiles(event.dataTransfer.files);
});
document.addEventListener('dragend', clearDocumentDragState);
window.addEventListener('blur', clearDocumentDragState);

els.formatOptions.addEventListener('click', event => {
  const button = event.target.closest('[data-format]');
  if (!button || state.busy) return;
  state.outputType = button.dataset.format;
  els.formatOptions.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
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
els.fileList.addEventListener('click', async event => {
  const remove = event.target.closest('[data-remove]');
  const download = event.target.closest('[data-download]');
  const zip = event.target.closest('[data-zip]');
  const move = event.target.closest('[data-move]');
  if (remove && !state.busy) removeFile(remove.dataset.remove);
  if (move && !state.busy) moveFile(move.dataset.id, Number(move.dataset.move));
  if (download) await downloadItem(state.files.find(item => item.id === download.dataset.download));
  if (zip) await downloadItemZip(state.files.find(item => item.id === zip.dataset.zip));
});
els.convertButton.addEventListener('click', convertAll);
els.downloadAllButton.addEventListener('click', downloadAll);

window.addEventListener('beforeunload', () => {
  state.files.forEach(item => {
    URL.revokeObjectURL(item.sourceUrl);
    item.results.forEach(result => URL.revokeObjectURL(result.url));
  });
  clearCombinedPdf();
});
