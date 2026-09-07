import type { Transaction, TxFilter, TxGroup, TxType } from "../parse/types";

function sortableDate(date: string): number {
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(`${match[3]}${match[2]}${match[1]}`);
}

export function groupTransactions(
  transactions: Transaction[],
  filter: TxFilter = "credit",
): TxGroup[] {
  const grouped = new Map<string, TxGroup>();

  for (const tx of transactions) {
    const title = tx.title.trim();
    if (!title) {
      continue;
    }

    const entries: Array<{ type: TxType; amount: number }> = [];
    if (filter !== "debit" && tx.credit > 0) {
      entries.push({ type: "credit", amount: tx.credit });
    }
    if (filter !== "credit" && tx.debit > 0) {
      entries.push({ type: "debit", amount: tx.debit });
    }

    for (const entry of entries) {
      const key = `${entry.type}\u0000${title}`;
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        current.total += entry.amount;
        if (sortableDate(tx.date) < sortableDate(current.firstDate)) {
          current.firstDate = tx.date;
        }
        if (sortableDate(tx.date) > sortableDate(current.lastDate)) {
          current.lastDate = tx.date;
        }
      } else {
        grouped.set(key, {
          title,
          type: entry.type,
          count: 1,
          total: entry.amount,
          firstDate: tx.date,
          lastDate: tx.date,
        });
      }
    }
  }

  return [...grouped.values()].sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.title.localeCompare(b.title);
  });
}

export function groupTotals(groups: TxGroup[]): {
  count: number;
  total: number;
} {
  return groups.reduce(
    (acc, group) => {
      acc.count += group.count;
      acc.total += group.total;
      return acc;
    },
    { count: 0, total: 0 },
  );
}

export function filterByTitle(groups: TxGroup[], query: string): TxGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return groups;
  }
  return groups.filter((group) => {
    const title = group.title.toLowerCase();
    return terms.every((term) => title.includes(term));
  });
}

export function dateRange(group: TxGroup): string {
  return group.firstDate === group.lastDate
    ? group.firstDate
    : `${group.firstDate} – ${group.lastDate}`;
}
