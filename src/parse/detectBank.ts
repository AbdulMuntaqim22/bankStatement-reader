import type { TextItem } from "./types";

type BankMatch = {
  name: string;
  patterns: RegExp[];
};

const BANKS: BankMatch[] = [
  { name: "HBL", patterns: [/\bhabib bank\b/i, /\bhbl\b/i] },
  { name: "Meezan Bank", patterns: [/\bmeezan\b/i, /mezn/i] },
  { name: "UBL", patterns: [/\bunited bank\b/i, /\bubl\b/i] },
  { name: "Allied Bank", patterns: [/\ballied bank\b/i, /\babl\b/i] },
  { name: "MCB", patterns: [/\bmcb\b/i, /\bmuslim commercial\b/i] },
  { name: "Bank Alfalah", patterns: [/\balfalah\b/i] },
  { name: "Bank AL Habib", patterns: [/\bbank al[-\s]?habib\b/i] },
  { name: "Askari Bank", patterns: [/\baskari\b/i] },
  { name: "Faysal Bank", patterns: [/\bfaysal\b/i] },
  {
    name: "Standard Chartered",
    patterns: [/\bstandard chartered\b/i, /\bscb\b/i],
  },
  { name: "JS Bank", patterns: [/\bjs bank\b/i] },
];

export function detectBank(items: TextItem[]): string | null {
  const sample = items
    .slice(0, 200)
    .map((item) => item.str)
    .join(" ");

  for (const bank of BANKS) {
    if (bank.patterns.some((pattern) => pattern.test(sample))) {
      return bank.name;
    }
  }
  return null;
}
