/**
 * Normalization used by the BridgeTime-derived alias layer.
 *
 * Full-width ASCII is converted before pattern matching, Unicode spacing is
 * collapsed, and no original text is retained in the returned value.
 */
export function normalize(text: string): string {
  return text
    .replace(
      /[\uff01-\uff5e]/g,
      (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ")
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u2060\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
