/*
 * Names the way people type them. Someone may search in Marathi for a name
 * stored in English (रोहित for Rohit), or spell it another way (Chaudhary,
 * Choudhari). Both the stored name and the search are reduced to the same
 * key: Devanagari written out in Latin letters, then the spellings that vary
 * most folded together.
 */

const VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ii', उ: 'u', ऊ: 'uu', ऋ: 'ru', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ॲ: 'a', ऑ: 'o', ऍ: 'e',
};
const SIGNS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ru', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o',
};
const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh',
  ष: 'sh', स: 's', ह: 'h', ळ: 'l',
};
const VIRAMA = '्';
const ANUSVARA = new Set(['ं', 'ँ']);
const DIGITS = '०१२३४५६७८९';

/** Whether the consonant at `at` is followed by a vowel: its own sign, or an inherent a that isn't dropped at the word's end. */
function carriesVowel(chars: string[], at: number): boolean {
  const next = chars[at + 1];
  if (next === VIRAMA) return false;
  if (next !== undefined && SIGNS[next]) return true;
  return next !== undefined && Boolean(CONSONANTS[next] || VOWELS[next] || ANUSVARA.has(next));
}

/**
 * Devanagari written out in Latin letters, the way names are usually spelt
 * in English: the inherent "a" is dropped at the end of a word and between a
 * vowel and a consonant that has its own vowel (गणपत → ganpat, not ganapat).
 * Anything else is left as it is.
 */
export function toLatin(text: string): string {
  const out: string[] = [];
  // Without the nukta: ज़ is written as ज.
  const chars = [...text.normalize('NFC').replace(/़/g, '')];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;
    const consonant = CONSONANTS[c];
    if (consonant === undefined) {
      if (VOWELS[c]) out.push(VOWELS[c] as string);
      else if (ANUSVARA.has(c)) out.push('n');
      else if (c === 'ः') out.push('h');
      else if (DIGITS.includes(c)) out.push(String(DIGITS.indexOf(c)));
      else if (c !== VIRAMA && !SIGNS[c]) out.push(c);
      continue;
    }
    out.push(consonant);
    const next = chars[i + 1];
    if (next && SIGNS[next]) {
      out.push(SIGNS[next] as string);
      i++;
    } else if (next === VIRAMA) {
      i++;
    } else {
      // The inherent a: dropped at the end of a word, and after a vowel when the next consonant has one of its own.
      const after = chars[i + 1];
      const endOfWord = after === undefined || !(CONSONANTS[after] || VOWELS[after] || ANUSVARA.has(after));
      const afterVowel = /[aeiou]$/.test(out.slice(0, -1).join(''));
      if (!endOfWord && !(afterVowel && after !== undefined && CONSONANTS[after] !== undefined && carriesVowel(chars, i + 1))) out.push('a');
    }
  }
  return out.join('');
}

/**
 * One word reduced to what stays the same across spellings: lower case,
 * Devanagari in Latin letters, long vowels short, w as v, ph as f, x as ksh,
 * no h after a consonant, no a at all, no doubled letters. "Chaudhary",
 * "Choudhari" and "चौधरी" all become the same key.
 */
export function nameKey(word: string): string {
  let s = toLatin(word).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z0-9]/g, '');
  s = s.replace(/x/g, 'ksh').replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 'j').replace(/q/g, 'k');
  s = s.replace(/c(?!h)/g, 'k');
  s = s.replace(/y$/, 'i');
  s = s.replace(/([bcdgjklmnprstvfy])h/g, '$1');
  s = s.replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u').replace(/ou/g, 'au');
  s = s.replace(/(?!^)a/g, '');
  s = s.replace(/(.)\1+/g, '$1');
  return s;
}

/** The words of a name, each as a key; empty keys (a lone "a") left out. */
export function nameKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[\s,./()'"-]+/u)
    .map(nameKey)
    .filter(Boolean);
}
