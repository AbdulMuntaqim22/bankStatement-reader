import { isAmountToken, parseAmount } from "./amount";
import { looksLikeDate, parsePkDate } from "./date";
import type { TextItem, Transaction } from "./types";

const Y_TOLERANCE = 6;

const DATE_ALIASES = [
  "booking date",
  "txn date",
  "trans date",
  "transaction date",
  "value date",
  "posting date",
  "tran date",
  "date",
];
const TITLE_ALIASES = [
  "particulars",
  "narration",
  "description",
  "details",
  "transaction details",
  "remarks",
  "narrative",
];
const DEBIT_ALIASES = [
  "debit",
  "withdrawal",
  "withdrawals",
  "dr",
  "debit amount",
];
const CREDIT_ALIASES = [
  "credit",
  "deposit",
  "deposits",
  "cr",
  "credit amount",
];
const BALANCE_ALIASES = [
  "available balance",
  "running balance",
  "closing balance",
  "balance",
];

const SKIP_ROW = [
  /opening\s+balance/i,
  /closing\s+balance/i,
  /brought\s+forward/i,
  /carried\s+forward/i,
  /balance\s+(b\/f|c\/f|b\/fwd|c\/fwd|bf|cf)/i,
  /^page\s+\d+/i,
  /statement\s+(of\s+account|period|date)/i,
  /account\s+(no|number|#|title)/i,
  /customer\s+(name|id)/i,
  /branch\s+(code|name)/i,
  /iban/i,
  /total\s+(debit|credit|withdrawal|deposit)/i,
];

type ColumnId = "date" | "title" | "debit" | "credit" | "balance";

type Column = {
  id: ColumnId;
  x: number;
};

type Line = {
  page: number;
  y: number;
  items: TextItem[];
  text: string;
};

function joinLine(items: TextItem[]): string {
  return items
    .map((item) => item.str.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function clusterLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) {
      return a.page - b.page;
    }
    if (Math.abs(b.y - a.y) > Y_TOLERANCE) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const lines: Line[] = [];
  for (const item of sorted) {
    const last = lines.at(-1);
    if (
      last &&
      last.page === item.page &&
      Math.abs(last.y - item.y) <= Y_TOLERANCE
    ) {
      last.items.push(item);
      last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
    } else {
      lines.push({ page: item.page, y: item.y, items: [item], text: "" });
    }
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = joinLine(line.items);
  }
  return lines;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findHeaderX(line: Line, aliases: string[]): number | null {
  const items = line.items.map((item) => ({
    x: item.x,
    text: normalize(item.str),
  }));

  for (const alias of aliases) {
    const parts = alias.split(" ");
    for (let i = 0; i < items.length; i++) {
      const slice = items.slice(i, i + parts.length);
      if (
        slice.length === parts.length &&
        slice.every((piece, idx) => piece.text === parts[idx])
      ) {
        return slice[0].x;
      }
    }
    const combined = items.find((item) => item.text.includes(alias));
    if (combined) {
      return combined.x;
    }
  }
  return null;
}

function detectColumns(lines: Line[]): Column[] | null {
  for (const line of lines.slice(0, 40)) {
    const dateX = findHeaderX(line, DATE_ALIASES);
    const titleX = findHeaderX(line, TITLE_ALIASES);
    const debitX = findHeaderX(line, DEBIT_ALIASES);
    const creditX = findHeaderX(line, CREDIT_ALIASES);
    const balanceX = findHeaderX(line, BALANCE_ALIASES);

    if (dateX === null || titleX === null || creditX === null) {
      continue;
    }

    const columns: Column[] = [
      { id: "date", x: dateX },
      { id: "title", x: titleX },
      { id: "credit", x: creditX },
    ];
    if (debitX !== null) {
      columns.push({ id: "debit", x: debitX });
    }
    if (balanceX !== null) {
      columns.push({ id: "balance", x: balanceX });
    }
    columns.sort((a, b) => a.x - b.x);
    return columns;
  }
  return null;
}

function columnForX(x: number, columns: Column[]): ColumnId {
  for (let i = 0; i < columns.length - 1; i += 1) {
    const midpoint = (columns[i].x + columns[i + 1].x) / 2;
    if (x < midpoint) {
      return columns[i].id;
    }
  }
  return columns[columns.length - 1].id;
}

function shouldSkip(text: string): boolean {
  return SKIP_ROW.some((pattern) => pattern.test(text));
}

function bucketsFromLine(
  line: Line,
  columns: Column[],
): Record<ColumnId, string[]> {
  const buckets: Record<ColumnId, string[]> = {
    date: [],
    title: [],
    debit: [],
    credit: [],
    balance: [],
  };
  for (const item of line.items) {
    const token = item.str.trim();
    if (!token) {
      continue;
    }
    buckets[columnForX(item.x, columns)].push(token);
  }
  return buckets;
}

function firstAmount(tokens: string[]): number {
  for (const token of tokens) {
    const amount = parseAmount(token);
    if (amount !== null) {
      return amount;
    }
  }
  return 0;
}

function firstDate(tokens: string[]): string | null {
  for (const token of tokens) {
    const date = parsePkDate(token);
    if (date) {
      return date;
    }
  }
  const joined = tokens.join(" ");
  return parsePkDate(joined);
}

function fallbackTokens(line: Line): {
  date: string | null;
  title: string;
  amounts: number[];
} {
  const dateToken = line.items.find((item) => looksLikeDate(item.str));
  const amounts: number[] = [];
  const titleParts: string[] = [];

  for (const item of line.items) {
    if (dateToken && item === dateToken) {
      continue;
    }
    if (isAmountToken(item.str)) {
      const amount = parseAmount(item.str);
      if (amount !== null) {
        amounts.push(amount);
      }
      continue;
    }
    titleParts.push(item.str.trim());
  }

  return {
    date: dateToken ? parsePkDate(dateToken.str) : null,
    title: titleParts.join(" ").replace(/\s+/g, " ").trim(),
    amounts,
  };
}

function inferDebitCredit(
  amounts: number[],
  previousBalance: number | null,
): { debit: number; credit: number; balance: number | null } {
  if (amounts.length >= 3) {
    return {
      debit: amounts[0],
      credit: amounts[1],
      balance: amounts[amounts.length - 1],
    };
  }
  if (amounts.length === 2) {
    const [maybeAmount, balance] = amounts;
    if (maybeAmount < 0) {
      return { debit: Math.abs(maybeAmount), credit: 0, balance };
    }
    if (maybeAmount > 0 && previousBalance === null) {
      return { debit: 0, credit: maybeAmount, balance };
    }
    if (previousBalance !== null) {
      if (balance > previousBalance + 0.001) {
        return { debit: 0, credit: Math.abs(maybeAmount), balance };
      }
      if (balance < previousBalance - 0.001) {
        return { debit: Math.abs(maybeAmount), credit: 0, balance };
      }
    }
    return { debit: 0, credit: Math.abs(maybeAmount), balance };
  }
  if (amounts.length === 1 && previousBalance !== null) {
    const balance = amounts[0];
    const delta = balance - previousBalance;
    if (delta > 0.001) {
      return { debit: 0, credit: delta, balance };
    }
    if (delta < -0.001) {
      return { debit: Math.abs(delta), credit: 0, balance };
    }
    return { debit: 0, credit: 0, balance };
  }
  return { debit: 0, credit: 0, balance: amounts.at(-1) ?? null };
}

export function parseTable(items: TextItem[]): Transaction[] {
  const lines = clusterLines(items.filter((item) => item.str.trim()));
  const columns = detectColumns(lines);
  const transactions: Transaction[] = [];
  let previousBalance: number | null = null;

  for (const line of lines) {
    if (!line.text || shouldSkip(line.text)) {
      continue;
    }
    if (columns && findHeaderX(line, DATE_ALIASES) !== null && findHeaderX(line, CREDIT_ALIASES) !== null) {
      continue;
    }

    if (columns) {
      const buckets = bucketsFromLine(line, columns);
      const date = firstDate(buckets.date) ?? firstDate(buckets.title);
      const title = buckets.title.join(" ").replace(/\s+/g, " ").trim();
      const debit = Math.abs(firstAmount(buckets.debit));
      const credit = Math.abs(firstAmount(buckets.credit));
      const balanceToken = firstAmount(buckets.balance);
      const balance = buckets.balance.length ? balanceToken : null;

      if (!date) {
        const last = transactions.at(-1);
        if (last && title && debit === 0 && credit === 0) {
          last.title = `${last.title} ${title}`.replace(/\s+/g, " ").trim();
        }
        continue;
      }

      if (!title && debit === 0 && credit === 0) {
        continue;
      }

      const tx: Transaction = {
        date,
        title,
        debit,
        credit,
        balance,
      };
      transactions.push(tx);
      if (balance !== null) {
        previousBalance = balance;
      }
      continue;
    }

    const fallback = fallbackTokens(line);
    if (!fallback.date) {
      const last = transactions.at(-1);
      if (last && fallback.title && fallback.amounts.length === 0) {
        last.title = `${last.title} ${fallback.title}`.replace(/\s+/g, " ").trim();
      }
      continue;
    }
    if (shouldSkip(fallback.title)) {
      continue;
    }
    const inferred = inferDebitCredit(fallback.amounts, previousBalance);
    transactions.push({
      date: fallback.date,
      title: fallback.title,
      debit: inferred.debit,
      credit: inferred.credit,
      balance: inferred.balance,
    });
    if (inferred.balance !== null) {
      previousBalance = inferred.balance;
    }
  }

  return transactions.filter((tx) => tx.title || tx.credit > 0 || tx.debit > 0);
}
