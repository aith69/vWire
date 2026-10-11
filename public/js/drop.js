/** True if the drag carries files (and not, say, selected text or a link). */
export const hasFiles = (dataTransfer) => Array.from(dataTransfer?.types ?? []).includes('Files');

/**
 * The dropped files: { files }, or { error: 'empty' | 'folder' }.
 * A folder anywhere in the drop rejects the whole drop: a partial selection would be sent without warning.
 */
export function pickDroppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer?.items ?? []).filter((item) => item.kind === 'file');
  const files = Array.from(dataTransfer?.files ?? []);
  if (Math.max(items.length, files.length) === 0) return { error: 'empty' };
  const hasFolder = items.some((item) => {
    const entry = item.webkitGetAsEntry?.();
    return entry && !entry.isFile;
  });
  if (hasFolder) return { error: 'folder' };
  if (files.length === 0) return { error: 'empty' };
  return { files };
}

/**
 * Drag and drop of one or more files onto the page.
 * - `isActive()` tells whether a drop is accepted right now (only on the home screen).
 * - A drop is ALWAYS cancelled for the browser: otherwise it would open the file, leave the page
 *   and end a transfer in progress.
 */
export function attachDrop(doc, { overlay, isActive, onFiles }) {
  let depth = 0;
  let timer = null;

  const hide = () => {
    clearTimeout(timer);
    depth = 0;
    overlay.hidden = true;
    overlay.classList.remove('invalid');
  };
  const flashInvalid = () => {
    overlay.hidden = false;
    overlay.classList.add('invalid');
    clearTimeout(timer);
    timer = setTimeout(hide, 2000);
  };

  doc.addEventListener('dragenter', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    depth += 1;
    if (isActive()) {
      clearTimeout(timer);
      overlay.classList.remove('invalid');
      overlay.hidden = false;
    }
  });

  doc.addEventListener('dragover', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isActive() ? 'copy' : 'none';
  });

  doc.addEventListener('dragleave', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0 && !overlay.classList.contains('invalid')) overlay.hidden = true;
  });

  doc.addEventListener('drop', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    const active = isActive();
    hide();
    if (!active) return;
    const result = pickDroppedFiles(event.dataTransfer);
    if (result.files) onFiles(result.files);
    else if (result.error !== 'empty') flashInvalid();
  });
}
