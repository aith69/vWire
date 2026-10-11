import { prepareZip, screenUi } from './prepare.js';
import { checkSize } from './limits.js';
import { formatBytes } from './format.js';

/**
 * From what the user picked to the single File that gets sent.
 *  - one file: passed through untouched
 *  - several files: packed into a zip (the preparation screen appears only if it takes a while)
 * Resolves to { file }, { cancelled: true } or { message }: the text to show (over the limit, or the
 * zip could not be built). The limit is checked on the sum of the sizes BEFORE reading anything,
 * and once more on the zip, whose headers add a few hundred bytes.
 * Folders are not handled here: drop.js refuses them, and the file pickers do not offer them.
 */
export async function resolveSelection(files, { t, maxBytes, prepare = prepareZip, ui } = {}) {
  const list = Array.from(files);
  if (list.length === 0) return { cancelled: true };

  const overLimit = (check) => ({
    message: t('limit.exceeded', { size: formatBytes(check.total), max: formatBytes(check.max) }),
  });

  const before = checkSize(list, maxBytes);
  if (!before.ok) return overLimit(before);
  if (list.length === 1) return { file: list[0] };

  try {
    const result = await prepare(list, { ui: ui ?? screenUi() });
    if (result.cancelled) return { cancelled: true };
    const after = checkSize([result.file], maxBytes);
    if (!after.ok) return overLimit(after);
    return { file: result.file };
  } catch (err) {
    console.error('[vwire] zip', err);
    return { message: t('zip.failed') };
  }
}
