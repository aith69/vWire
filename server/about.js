import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const ABOUT_LIMITS = { title: 100, text: 20000, link: 300 };

const KEYS = ['title', 'text', 'link'];
const BAD_TITLE = /[\u0000-\u001f\u007f]/;
// In the text, new lines and tabs are fine; other control characters are not.
const BAD_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** An absolute http(s) address without user name and password, or null. */
function checkLink(value) {
  if (typeof value !== 'string' || value.length > ABOUT_LIMITS.link) return null;
  try {
    const url = new URL(value.trim());
    const ok = (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
    return ok ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Checks the content of an about file: { title, text, link? }.
 * Returns { value, errors }. An empty object (or one with only "_" notes) means "no info page": value null.
 * Keys that start with "_" are ignored (free notes).
 */
export function parseAboutFile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { value: null, errors: ['must be a JSON object with "title", "text" and an optional "link"'] };
  }
  const keys = Object.keys(data).filter((key) => !key.startsWith('_'));
  const errors = keys
    .filter((key) => !KEYS.includes(key))
    .map((key) => `unknown key "${key}" (valid keys: ${KEYS.join(', ')})`);
  if (keys.length === 0) return { value: null, errors: [] };

  const title = typeof data.title === 'string' ? data.title.trim() : null;
  if (title === null || title.length < 1 || title.length > ABOUT_LIMITS.title || BAD_TITLE.test(title)) {
    errors.push(`"title" is required: text of 1-${ABOUT_LIMITS.title} characters on a single line`);
  }

  const text = typeof data.text === 'string' ? data.text.replace(/\r\n?/g, '\n').trim() : null;
  if (text === null || text.length < 1 || text.length > ABOUT_LIMITS.text || BAD_TEXT.test(text)) {
    errors.push(`"text" is required: text of 1-${ABOUT_LIMITS.text} characters (use \\n\\n between paragraphs)`);
  }

  let link = null;
  if (data.link !== undefined && data.link !== null && data.link !== '') {
    link = checkLink(data.link);
    if (link === null) {
      errors.push(
        `"link" is not valid: expected an http(s) address of up to ${ABOUT_LIMITS.link} characters, without user name or password`,
      );
    }
  }
  return { value: errors.length ? null : { title, text, link }, errors };
}

/**
 * Reads about.json, or about.example.json if there is none. Returns { title, text, link } or null.
 * With NODE_ENV=test only the example is read, so the tests do not depend on the local file.
 * A file that cannot be read or is not valid throws: the server refuses to start, like with config.json.
 */
export function loadAbout({ env = process.env, useFile = env.NODE_ENV !== 'test', dir = root } = {}) {
  const names = useFile ? ['about.json', 'about.example.json'] : ['about.example.json'];
  for (const name of names) {
    const path = join(dir, name);
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw new Error(`Cannot read ${path}: ${err.message}`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`${path} is not valid JSON: ${err.message}`);
    }
    const { value, errors } = parseAboutFile(data);
    if (errors.length) throw new Error(`Invalid ${name}:\n  - ${errors.join('\n  - ')}`);
    return value;
  }
  return null;
}
