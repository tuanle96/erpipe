export const MAX_CROSS_INSTANCE_TARGETS = 10;
export const DEFAULT_CROSS_INSTANCE_CONCURRENCY = 4;
export const DEFAULT_CROSS_INSTANCE_LIMIT = 10;
export const MAX_CROSS_INSTANCE_LIMIT = 50;
export const MAX_CROSS_INSTANCE_RECORDS = 200;
export const INSTANCE_TAG_KEY = "_instance";
export const MAX_INSTANCE_KEY_LENGTH = 63;
export const INSTANCE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export type InstanceSelector = "all" | string[];

export type InstanceMeta = {
  slug: string;
  label: string;
  status: string;
  writesEnabled: boolean;
};

export type InstanceSelection = {
  selected: string[];
  unknown: string[];
};

export type FanOutResult<T> = {
  results: Record<string, T>;
  errors: Record<string, string>;
  instances_queried: string[];
  instance_count: number;
  partial: boolean;
  truncated: boolean;
};

export type AggregateMeasure = {
  field: string;
  operator: "sum" | "count" | "avg" | "min" | "max";
};

export function isCanonicalInstanceKey(value: string): boolean {
  return value.length <= MAX_INSTANCE_KEY_LENGTH && INSTANCE_KEY_PATTERN.test(value);
}

export type CurrencyAccountingReport = {
  currency: string;
  buckets?: Record<string, number>;
  total_outstanding?: number;
};

export function selectInstances(
  selector: InstanceSelector,
  availableSlugs: Iterable<string>,
): InstanceSelection {
  const available = new Set(
    [...availableSlugs].map((slug) => slug.trim()).filter((slug) => isCanonicalInstanceKey(slug)),
  );
  if (!available.size) throw new Error("No active instances are available");

  const normalized = selector === "all" ? [...available] : selector.map((slug) => slug.trim());
  if (normalized.some((slug) => !isCanonicalInstanceKey(slug))) {
    throw new Error("instances contains an invalid instance key");
  }
  const requested = [...new Set(normalized)];
  if (!requested.length) throw new Error("instances must be 'all' or a non-empty slug list");

  const selected = requested.filter((slug) => available.has(slug)).sort();
  const unknown = requested.filter((slug) => !available.has(slug)).sort();
  if (!selected.length) {
    throw new Error(`No requested instances are available: ${unknown.join(", ")}`);
  }
  if (selected.length > MAX_CROSS_INSTANCE_TARGETS) {
    throw new Error(`At most ${MAX_CROSS_INSTANCE_TARGETS} instances may be queried at once`);
  }
  return { selected, unknown };
}

export function clampCrossInstanceLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_CROSS_INSTANCE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit_per_instance must be a positive integer");
  }
  return Math.min(limit, MAX_CROSS_INSTANCE_LIMIT);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export async function fanOut<T>(
  selected: string[],
  worker: (instance: string) => Promise<T>,
  concurrency = DEFAULT_CROSS_INSTANCE_CONCURRENCY,
): Promise<FanOutResult<T>> {
  if (!selected.length) throw new Error("At least one instance must be selected");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }

  const targets = [...new Set(selected)].sort();
  if (targets.length > MAX_CROSS_INSTANCE_TARGETS) {
    throw new Error(`At most ${MAX_CROSS_INSTANCE_TARGETS} instances may be queried at once`);
  }

  const results: Record<string, T> = {};
  const errors: Record<string, string> = {};
  let cursor = 0;
  const runWorker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const instance = targets[cursor];
      cursor += 1;
      if (!instance) return;
      try {
        results[instance] = await worker(instance);
      } catch (error) {
        errors[instance] = errorMessage(error);
      }
    }
  };

  const workerCount = Math.min(concurrency, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return makeFanOutResult(results, errors);
}

export function makeFanOutResult<T>(
  results: Record<string, T>,
  errors: Record<string, string>,
  truncated = false,
): FanOutResult<T> {
  const instances = [...new Set([...Object.keys(results), ...Object.keys(errors)])].sort();
  return {
    results,
    errors,
    instances_queried: instances,
    instance_count: instances.length,
    partial: Object.keys(errors).length > 0,
    truncated,
  };
}

export function attributeRecords(
  recordsByInstance: Record<string, Record<string, unknown>[]>,
  maxRecords = MAX_CROSS_INSTANCE_RECORDS,
): { records: Record<string, unknown>[]; truncated: boolean } {
  if (!Number.isInteger(maxRecords) || maxRecords < 1) {
    throw new Error("maxRecords must be a positive integer");
  }
  const records: Record<string, unknown>[] = [];
  let total = 0;
  for (const instance of Object.keys(recordsByInstance).sort()) {
    for (const record of recordsByInstance[instance] ?? []) {
      total += 1;
      if (records.length < maxRecords) records.push({ ...record, [INSTANCE_TAG_KEY]: instance });
    }
  }
  return { records, truncated: total > maxRecords };
}

export function combineAdditiveAggregates(
  rowsByInstance: Record<string, Record<string, unknown>[]>,
  measures: AggregateMeasure[],
): { combined_count: number; combined_measures: Record<string, number> } {
  const additive = measures.filter(({ operator }) => operator === "sum" || operator === "count");
  const combined: Record<string, number> = Object.fromEntries(
    additive.map(({ field }) => [field, 0]),
  );
  let combinedCount = 0;

  for (const rows of Object.values(rowsByInstance)) {
    for (const row of rows) {
      const count = row.__count;
      if (typeof count === "number" && Number.isFinite(count)) combinedCount += count;
      for (const { field } of additive) {
        const value = row[field];
        if (typeof value === "number" && Number.isFinite(value)) {
          combined[field] = (combined[field] ?? 0) + value;
        }
      }
    }
  }
  return { combined_count: combinedCount, combined_measures: combined };
}

export function combineAccountingByCurrency(
  reportsByInstance: Record<string, CurrencyAccountingReport>,
): {
  combined_by_currency: Record<
    string,
    { buckets: Record<string, number>; total_outstanding: number }
  >;
} {
  const combined: Record<string, { buckets: Record<string, number>; total_outstanding: number }> =
    {};
  for (const report of Object.values(reportsByInstance)) {
    const currency = report.currency.trim();
    if (!currency) throw new Error("Accounting report currency is required");
    let target = combined[currency];
    if (!target) {
      target = { buckets: {}, total_outstanding: 0 };
      combined[currency] = target;
    }
    for (const [bucket, amount] of Object.entries(report.buckets ?? {})) {
      if (Number.isFinite(amount)) target.buckets[bucket] = (target.buckets[bucket] ?? 0) + amount;
    }
    if (Number.isFinite(report.total_outstanding)) {
      target.total_outstanding += report.total_outstanding ?? 0;
    }
  }
  return { combined_by_currency: combined };
}
