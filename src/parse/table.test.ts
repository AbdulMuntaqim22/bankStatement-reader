import { describe, expect, it } from "vitest";
import { detectBank } from "./detectBank";
import { parseTable } from "./table";
import type { TextItem } from "./types";

function item(
  str: string,
  x: number,
  y: number,
  page = 1,
): TextItem {
  return { str, x, y, width: str.length * 5, height: 10, page };
}

describe("parseTable", () => {
  it("rebuilds rows from header columns and keeps credits", () => {
    const items: TextItem[] = [
      item("Habib Bank Limited", 40, 780),
      item("Date", 50, 700),
      item("Particulars", 140, 700),
      item("Debit", 400, 700),
      item("Credit", 490, 700),
      item("Balance", 580, 700),
      item("01/01/2026", 50, 680),
      item("SALARY CREDIT", 140, 680),
      item("120000.00", 490, 680),
      item("150000.00", 580, 680),
      item("02/01/2026", 50, 660),
      item("IBFT FROM ALI KHAN", 140, 660),
      item("15000.00", 490, 660),
      item("165000.00", 580, 660),
      item("05/01/2026", 50, 640),
      item("IBFT FROM ALI KHAN", 140, 640),
      item("15000.00", 490, 640),
      item("180000.00", 580, 640),
      item("06/01/2026", 50, 620),
      item("ATM WITHDRAWAL", 140, 620),
      item("5000.00", 400, 620),
      item("175000.00", 580, 620),
    ];

    const rows = parseTable(items);
    expect(detectBank(items)).toBe("HBL");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      date: "01/01/2026",
      title: "SALARY CREDIT",
      credit: 120000,
      debit: 0,
    });
    expect(rows[3]).toMatchObject({
      title: "ATM WITHDRAWAL",
      debit: 5000,
      credit: 0,
    });
  });

  it("joins multi-line titles and skips opening balance", () => {
    const items: TextItem[] = [
      item("Date", 50, 700),
      item("Narration", 140, 700),
      item("Withdrawal", 400, 700),
      item("Deposit", 490, 700),
      item("Balance", 580, 700),
      item("01/01/2026", 50, 680),
      item("Opening Balance", 140, 680),
      item("10000.00", 580, 680),
      item("02/01/2026", 50, 660),
      item("IBFT FROM", 140, 660),
      item("8000.00", 490, 660),
      item("18000.00", 580, 660),
      item("JOHN DOE REF 99", 140, 648),
    ];

    const rows = parseTable(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("IBFT FROM JOHN DOE REF 99");
    expect(rows[0].credit).toBe(8000);
  });

  it("parses Meezan booking-date columns and signed PKR credits", () => {
    const items: TextItem[] = [
      item("Meezan Bank", 40, 780),
      item("Booking Date", 45, 556),
      item("Description", 169, 556),
      item("Credit", 307, 556),
      item("Debit", 408, 556),
      item("Available Balance", 483, 556),
      item("02 Jul 2025", 51, 531),
      item("Transfer Online 10527173", 135, 531),
      item("+ PKR400,000.00", 282, 531),
      item("PKR655,808.98", 484, 531),
      item("02 Jul 2025", 51, 500),
      item("Money Received from", 142, 500),
      item("+ PKR150,000.00", 282, 500),
      item("PKR805,808.98", 484, 500),
      item("MUHAMMAD AWAIS", 131, 480),
      item("03 Jul 2025", 51, 398),
      item("POS Purchase FOOD", 142, 398),
      item("- PKR933.61", 387, 398),
      item("PKR804,875.37", 480, 398),
    ];

    const rows = parseTable(items);
    expect(detectBank(items)).toBe("Meezan Bank");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      date: "02/07/2025",
      title: "Transfer Online 10527173",
      credit: 400000,
      debit: 0,
    });
    expect(rows[1].title).toBe("Money Received from MUHAMMAD AWAIS");
    expect(rows[1].credit).toBe(150000);
    expect(rows[2]).toMatchObject({
      title: "POS Purchase FOOD",
      debit: 933.61,
      credit: 0,
    });
  });

  it("infers credit vs debit from balance when headers are missing", () => {
    const items: TextItem[] = [
      item("03/02/2026", 40, 500),
      item("FUNDS TRANSFER IN", 120, 500),
      item("2500.00", 420, 500),
      item("12500.00", 500, 500),
      item("04/02/2026", 40, 480),
      item("POS PURCHASE", 120, 480),
      item("500.00", 420, 480),
      item("12000.00", 500, 480),
    ];

    const rows = parseTable(items);
    expect(rows[0].credit).toBe(2500);
    expect(rows[0].debit).toBe(0);
    expect(rows[1].debit).toBe(500);
    expect(rows[1].credit).toBe(0);
  });
});
