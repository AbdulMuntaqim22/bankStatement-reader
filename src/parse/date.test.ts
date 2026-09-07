import { describe, expect, it } from "vitest";
import { looksLikeDate, parsePkDate } from "./date";

describe("parsePkDate", () => {
  it("parses slash, dash, and dot dates", () => {
    expect(parsePkDate("1/1/2026")).toBe("01/01/2026");
    expect(parsePkDate("05-03-2026")).toBe("05/03/2026");
    expect(parsePkDate("15.12.26")).toBe("15/12/2026");
  });

  it("parses named months", () => {
    expect(parsePkDate("03 Jan 2026")).toBe("03/01/2026");
    expect(parsePkDate("12 February, 2025")).toBe("12/02/2025");
  });

  it("rejects impossible dates", () => {
    expect(parsePkDate("32/01/2026")).toBeNull();
    expect(parsePkDate("not a date")).toBeNull();
  });
});

describe("looksLikeDate", () => {
  it("detects date tokens", () => {
    expect(looksLikeDate("01/01/2026")).toBe(true);
    expect(looksLikeDate("ATM WITHDRAWAL")).toBe(false);
  });
});
