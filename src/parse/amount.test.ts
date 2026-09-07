import { describe, expect, it } from "vitest";
import { isAmountToken, parseAmount } from "./amount";

describe("parseAmount", () => {
  it("parses plain and comma-grouped PK amounts", () => {
    expect(parseAmount("120000.00")).toBe(120000);
    expect(parseAmount("15,000.50")).toBe(15000.5);
    expect(parseAmount("1,234.56")).toBe(1234.56);
  });

  it("parses Meezan-style signed PKR amounts", () => {
    expect(parseAmount("+ PKR400,000.00")).toBe(400000);
    expect(parseAmount("- PKR5,000.00")).toBe(-5000);
    expect(parseAmount("PKR655,808.98")).toBe(655808.98);
    expect(parseAmount("+ PKR1,450,000.00")).toBe(1450000);
  });

  it("treats parentheses and trailing minus as negative", () => {
    expect(parseAmount("(1,000.00)")).toBe(-1000);
    expect(parseAmount("250.00-")).toBe(-250);
  });

  it("returns null for blanks and non-amounts", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("IBFT FROM ALI")).toBeNull();
  });
});

describe("isAmountToken", () => {
  it("accepts numeric tokens only", () => {
    expect(isAmountToken("1,000.00")).toBe(true);
    expect(isAmountToken("SALARY CREDIT")).toBe(false);
  });
});
