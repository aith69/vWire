/**
 * Characters that make a file name lie or hide something: control characters, forced text direction
 * (an RLO can make "photo<RLO>gpj.exe" look like "photoexe.jpg"), zero-width and other invisible
 * characters, line separators. The joiners U+200C and U+200D are kept: emoji sequences and some scripts need them.
 */
const INVISIBLE =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/gu;

export const stripInvisible = (text) => String(text ?? '').replace(INVISIBLE, '');

// Windows cannot create files named like its devices, with or without an extension (CON.txt).
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function avoidReservedName(name) {
  const base = name.split('.')[0].trimEnd();
  return RESERVED.test(base) ? `_${name}` : name;
}
