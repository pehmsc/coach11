import { describe, it, expect } from "vitest";
import {
  formatCents,
  isOverdue,
  daysOverdue,
  statusLabel,
  formatPeriod,
  type InvoiceLike,
} from "./invoice-helpers";

const TODAY = new Date("2026-05-26T10:00:00.000Z");

// Intl.NumberFormat usa NBSP entre valor e simbolo; normalizamos para comparar
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatCents", () => {
  it("formats euros with PT locale", () => {
    expect(norm(formatCents(15000))).toBe("150,00 €");
    expect(norm(formatCents(0))).toBe("0,00 €");
    expect(norm(formatCents(99))).toBe("0,99 €");
    expect(norm(formatCents(12345))).toBe("123,45 €");
  });

  it("supports other currencies", () => {
    expect(formatCents(10000, "USD")).toContain("100,00");
  });
});

describe("isOverdue", () => {
  it("returns false for paid invoices", () => {
    const inv: InvoiceLike = {
      status: "paid",
      due_date: "2020-01-01",
      paid_at: "2020-01-05",
    };
    expect(isOverdue(inv, TODAY)).toBe(false);
  });

  it("returns false for cancelled invoices", () => {
    const inv: InvoiceLike = {
      status: "cancelled",
      due_date: "2020-01-01",
      paid_at: null,
    };
    expect(isOverdue(inv, TODAY)).toBe(false);
  });

  it("returns true when issued and due_date past", () => {
    const inv: InvoiceLike = {
      status: "issued",
      due_date: "2026-05-18",
      paid_at: null,
    };
    expect(isOverdue(inv, TODAY)).toBe(true);
  });

  it("returns false when issued and due_date is today", () => {
    const inv: InvoiceLike = {
      status: "issued",
      due_date: "2026-05-26",
      paid_at: null,
    };
    expect(isOverdue(inv, TODAY)).toBe(false);
  });

  it("returns false when issued and due_date future", () => {
    const inv: InvoiceLike = {
      status: "issued",
      due_date: "2026-06-18",
      paid_at: null,
    };
    expect(isOverdue(inv, TODAY)).toBe(false);
  });
});

describe("daysOverdue", () => {
  it("returns 0 when not overdue", () => {
    const inv: InvoiceLike = {
      status: "issued",
      due_date: "2026-06-01",
      paid_at: null,
    };
    expect(daysOverdue(inv, TODAY)).toBe(0);
  });

  it("returns positive day count when overdue", () => {
    const inv: InvoiceLike = {
      status: "issued",
      due_date: "2026-05-18",
      paid_at: null,
    };
    expect(daysOverdue(inv, TODAY)).toBe(8);
  });
});

describe("statusLabel", () => {
  it("labels paid invoices with date", () => {
    const inv: InvoiceLike = {
      status: "paid",
      due_date: "2026-04-18",
      paid_at: "2026-04-14",
    };
    const label = statusLabel(inv, TODAY);
    expect(label).toContain("Paga");
    expect(label).toContain("14");
  });

  it("labels cancelled invoices", () => {
    const inv: InvoiceLike = {
      status: "cancelled",
      due_date: "2026-04-18",
      paid_at: null,
    };
    expect(statusLabel(inv, TODAY)).toBe("Cancelada");
  });

  it("labels overdue invoices with day count", () => {
    const inv: InvoiceLike = {
      status: "issued",
      due_date: "2026-05-18",
      paid_at: null,
    };
    expect(statusLabel(inv, TODAY)).toBe("Em atraso · +8d");
  });

  it("labels open invoices", () => {
    const inv: InvoiceLike = {
      status: "issued",
      due_date: "2026-06-18",
      paid_at: null,
    };
    expect(statusLabel(inv, TODAY)).toBe("Em aberto");
  });
});

describe("formatPeriod", () => {
  it("returns null when both empty", () => {
    expect(formatPeriod(null, null)).toBeNull();
  });

  it("returns single label when same month", () => {
    const label = formatPeriod("2026-04-01", "2026-04-30");
    expect(label).not.toBeNull();
    expect(label).toContain("2026");
    // Mes Apr (4) presente em qualquer formato (abr, Apr, ou 04)
    expect(label).toMatch(/abr|Apr|04/i);
  });

  it("returns range when different months", () => {
    const label = formatPeriod("2026-04-01", "2026-05-31");
    expect(label).not.toBeNull();
    // Deve conter um separador de range
    expect(label).toContain("—");
  });

  it("falls back to single date when only one set", () => {
    expect(formatPeriod("2026-04-01", null)).not.toBeNull();
    expect(formatPeriod(null, "2026-05-31")).not.toBeNull();
  });
});
