const CURRENCY = /PKR|Rs\.?|₨/gi;
const CR_DR = /\b(CR|DR)\b/gi;

export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s || s === "-" || s === "--" || s === "—") {
    return null;
  }

  s = s.replace(CURRENCY, "").replace(CR_DR, "").trim();

  const leadingSign = /^[+-]/.test(s) ? s[0] : "";
  const negativeParens = /^\(.*\)$/.test(s);
  const trailingMinus = /-$/.test(s);
  s = s.replace(/^[+-]\s*/, "").replace(/[()]/g, "").replace(/-$/, "").trim();
  s = s.replace(/,/g, "");

  if (!/^\d+(\.\d+)?$/.test(s)) {
    return null;
  }

  let value = Number.parseFloat(s);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (leadingSign === "-" || negativeParens || trailingMinus) {
    value = -Math.abs(value);
  }
  return value;
}

export function isAmountToken(raw: string): boolean {
  return parseAmount(raw) !== null;
}
