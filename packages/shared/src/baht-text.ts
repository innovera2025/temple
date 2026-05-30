/**
 * Thai "baht text" — render a money amount (integer satang) as Thai words for
 * receipts/ใบอนุโมทนา, e.g. 100050 -> "หนึ่งพันบาทห้าสิบสตางค์",
 * 100 -> "หนึ่งบาทถ้วน", 0 -> "ศูนย์บาทถ้วน".
 *
 * Dependency-free and shared by API (receipt preview) and web (printable view).
 */

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/**
 * Read an integer 1..999,999 as Thai words. `hasHigher` is true when a higher
 * group (millions) precedes it, so a trailing 1 becomes "เอ็ด" (e.g.
 * 1,000,001 -> "หนึ่งล้านเอ็ด") rather than "หนึ่ง".
 */
function readBelowMillion(value: number, hasHigher: boolean): string {
  const digits = String(value).split("").map(Number);
  const len = digits.length;
  let result = "";

  for (let i = 0; i < len; i++) {
    const digit = digits[i] ?? 0;
    const place = len - 1 - i; // 0 = units, 1 = tens, ... 5 = แสน
    if (digit === 0) {
      continue;
    }
    const digitWord = THAI_DIGITS[digit] ?? "";
    if (place === 1) {
      // tens place reads specially
      result += digit === 1 ? "สิบ" : digit === 2 ? "ยี่สิบ" : `${digitWord}สิบ`;
    } else if (place === 0) {
      // a units 1 after any higher non-zero digit is "เอ็ด"
      result += digit === 1 && (len > 1 || hasHigher) ? "เอ็ด" : digitWord;
    } else {
      result += digitWord + (THAI_PLACE[place] ?? "");
    }
  }

  return result;
}

/** Read a non-negative integer as Thai words, cycling "ล้าน" for each million. */
function readInteger(value: number): string {
  if (value === 0) {
    return "ศูนย์";
  }
  if (value >= 1_000_000) {
    const millions = Math.floor(value / 1_000_000);
    const remainder = value % 1_000_000;
    return (
      readInteger(millions) + "ล้าน" + (remainder === 0 ? "" : readBelowMillion(remainder, true))
    );
  }
  return readBelowMillion(value, false);
}

/**
 * Convert integer satang to Thai baht text. Fractional/negative inputs are
 * normalised (rounded / prefixed "ลบ"); donations are always positive integers.
 */
export function bahtText(satang: number | bigint): string {
  let total = typeof satang === "bigint" ? Number(satang) : Math.round(satang);
  const negative = total < 0;
  total = Math.abs(total);

  const baht = Math.floor(total / 100);
  const cents = total % 100;

  if (baht === 0 && cents === 0) {
    return "ศูนย์บาทถ้วน";
  }

  let text = "";
  if (baht > 0) {
    text += readInteger(baht) + "บาท";
  }
  if (cents > 0) {
    text += readBelowMillion(cents, false) + "สตางค์";
  } else {
    text += "ถ้วน";
  }

  return (negative ? "ลบ" : "") + text;
}
