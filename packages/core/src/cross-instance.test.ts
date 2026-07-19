import { describe, expect, it } from "vitest";
import {
  attributeRecords,
  combineAccountingByCurrency,
  combineAdditiveAggregates,
  fanOut,
  selectInstances,
} from "./cross-instance.js";

describe("cross-instance helpers", () => {
  it("selects explicit instances deterministically and reports unknown slugs", () => {
    expect(selectInstances(["west", "east", "west", "missing"], ["east", "west"])).toEqual({
      selected: ["east", "west"],
      unknown: ["missing"],
    });
    expect(() => selectInstances(["missing"], ["east"])).toThrow(/No requested instances/);
  });

  it("rejects unbounded or non-canonical selectors without echoing attacker input", () => {
    const oversized = "x".repeat(100_000);
    let message = "";
    try {
      selectInstances(["east", oversized], ["east"]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const envelope = JSON.stringify({ success: false, error: message });
    expect(envelope.length).toBeLessThan(25_000);
    expect(envelope).not.toContain(oversized);
    expect(() => selectInstances(["East"], ["east"])).toThrow(/invalid instance key/);
  });

  it("caps fan-out at 10 targets", async () => {
    await expect(
      fanOut(
        Array.from({ length: 11 }, (_, index) => `instance-${index}`),
        async () => true,
      ),
    ).rejects.toThrow(/At most 10/);
  });

  it("runs no more than four workers and isolates partial errors", async () => {
    let active = 0;
    let maxActive = 0;
    const result = await fanOut(
      Array.from({ length: 10 }, (_, index) => `instance-${index}`),
      async (instance) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        if (instance === "instance-4") throw new Error("offline");
        return instance;
      },
    );

    expect(maxActive).toBe(4);
    expect(result.instance_count).toBe(10);
    expect(result.partial).toBe(true);
    expect(result.errors["instance-4"]).toMatch(/offline/);
    expect(Object.keys(result.results)).toHaveLength(9);
  });

  it("attributes and caps merged records before serialization", () => {
    expect(
      attributeRecords(
        {
          west: [{ id: 2 }, { id: 3 }],
          east: [{ id: 1 }],
        },
        2,
      ),
    ).toEqual({
      records: [
        { id: 1, _instance: "east" },
        { id: 2, _instance: "west" },
      ],
      truncated: true,
    });
  });

  it("combines only additive aggregate measures", () => {
    expect(
      combineAdditiveAggregates(
        {
          east: [{ amount_total: 10, score: 5, __count: 2 }],
          west: [{ amount_total: 12, score: 9, __count: 3 }],
        },
        [
          { field: "amount_total", operator: "sum" },
          { field: "score", operator: "avg" },
        ],
      ),
    ).toEqual({ combined_count: 5, combined_measures: { amount_total: 22 } });
  });

  it("keeps accounting totals separated by currency", () => {
    expect(
      combineAccountingByCurrency({
        east: { currency: "USD", buckets: { overdue: 10 }, total_outstanding: 10 },
        west: { currency: "EUR", buckets: { overdue: 20 }, total_outstanding: 20 },
        north: { currency: "USD", buckets: { current: 5 }, total_outstanding: 5 },
      }),
    ).toEqual({
      combined_by_currency: {
        USD: { buckets: { overdue: 10, current: 5 }, total_outstanding: 15 },
        EUR: { buckets: { overdue: 20 }, total_outstanding: 20 },
      },
    });
  });
});
