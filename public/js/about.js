import { $ } from './ui.js';

/** The link as an absolute http(s) address without credentials, or null. */
export function safeLink(value) {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value);
    const ok = (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
    return ok ? url.href : null;
  } catch {
    return null;
  }
}

/** What /api/config sent for the info page, checked again here: { title, text, link } or null. */
export function parseAbout(data) {
  if (!data || typeof data !== 'object') return null;
  const { title, text } = data;
  if (typeof title !== 'string' || typeof text !== 'string') return null;
  if (title.trim() === '' || text.trim() === '') return null;
  return { title: title.trim(), text, link: safeLink(data.link) };
}

/** The link as shown to the user: no protocol and no trailing slash. */
export const displayLink = (href) => href.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Puts the texts in the page. Everything goes in as plain text: no HTML is ever interpreted. */
export function fillAbout(about) {
  $('about-title').textContent = about.title;
  $('about-text').textContent = about.text;
  const link = $('about-link');
  if (about.link) {
    link.href = about.link;
    link.textContent = displayLink(about.link);
    link.hidden = false;
  } else {
    link.hidden = true;
  }
  $('btn-about').setAttribute('aria-label', about.title);
}
