import { describe, expect, it } from "vitest";
import {
  dateRange,
  filterByTitle,
  groupTotals,
  groupTransactions,
} from "./credits";
import type { Transaction } from "../parse/types";

function tx(
  title: string,
  credit: number,
  debit = 0,
  date = "01/01/2026",
): Transaction {
  return { date, title, credit, debit, balance: null };
}

describe("groupTransactions", () => {
  it("sums credits that share an exact title", () => {
    const groups = groupTransactions([
      tx("SALARY CREDIT", 120000),
      tx("IBFT FROM ALI KHAN", 15000),
      tx("IBFT FROM ALI KHAN", 15000),
      tx("ATM WITHDRAWAL", 0, 5000),
      tx("IBFT FROM ALI REF 111", 1000),
      tx("IBFT FROM ALI REF 222", 1000),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "SALARY CREDIT",
      "IBFT FROM ALI KHAN",
      "IBFT FROM ALI REF 111",
      "IBFT FROM ALI REF 222",
    ]);
    expect(groups.every((group) => group.type === "credit")).toBe(true);
    expect(groups[1]).toMatchObject({ count: 2, total: 30000 });
    expect(groupTotals(groups)).toEqual({ count: 5, total: 152000 });
  });

  it("filters to debits only", () => {
    const groups = groupTransactions(
      [tx("SALARY CREDIT", 120000), tx("ATM WITHDRAWAL", 0, 5000)],
      "debit",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      title: "ATM WITHDRAWAL",
      type: "debit",
      total: 5000,
    });
  });

  it("keeps credit and debit separate when showing both", () => {
    const groups = groupTransactions(
      [tx("TRANSFER", 900), tx("TRANSFER", 0, 400)],
      "all",
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.type)).toEqual(["credit", "debit"]);
  });

  it("tracks the date range of each group", () => {
    const groups = groupTransactions([
      tx("RENT IN", 500, 0, "12/03/2026"),
      tx("RENT IN", 500, 0, "02/01/2026"),
      tx("ONE OFF", 100, 0, "05/02/2026"),
    ]);

    expect(dateRange(groups[0])).toBe("02/01/2026 – 12/03/2026");
    expect(dateRange(groups[1])).toBe("05/02/2026");
  });

  it("ignores empty titles and zero amounts", () => {
    expect(groupTransactions([tx(" ", 50), tx("KEEP", 0)])).toEqual([]);
  });
});

describe("filterByTitle", () => {
  const groups = groupTransactions([
    tx("Raast P2P Fund transfer from ABDUL", 100),
    tx("Online Cash Deposit 0878241", 200),
    tx("Money Received from MUHAMMAD AWAIS", 300),
  ]);

  it("matches case-insensitively on any part of the title", () => {
    expect(filterByTitle(groups, "cash").map((g) => g.title)).toEqual([
      "Online Cash Deposit 0878241",
    ]);
  });

  it("requires every search term to match", () => {
    expect(filterByTitle(groups, "raast abdul")).toHaveLength(1);
    expect(filterByTitle(groups, "raast awais")).toHaveLength(0);
  });

  it("returns everything for a blank query", () => {
    expect(filterByTitle(groups, "   ")).toHaveLength(3);
  });
});
