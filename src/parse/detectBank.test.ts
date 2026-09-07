import { describe, expect, it } from "vitest";
import { detectBank } from "./detectBank";
import type { TextItem } from "./types";

describe("detectBank", () => {
  it("detects Meezan from IBAN bank code", () => {
    const items: TextItem[] = [
      {
        str: "Account Statement",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        page: 1,
      },
      {
        str: "PK00MEZN0000000000000000",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        page: 1,
      },
    ];
    expect(detectBank(items)).toBe("Meezan Bank");
  });
});
