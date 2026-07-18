const SAFE_DOMAIN_OPERATORS = new Set([
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "like",
  "not like",
  "ilike",
  "not ilike",
  "in",
  "not in",
  "child_of",
  "parent_of",
  "=?",
  "=like",
  "=ilike",
]);

export type DomainConditionInput = {
  field: string;
  operator: string;
  value: unknown;
};

export type BuildDomainResult = {
  success: boolean;
  tool: "build_domain";
  domain: unknown[];
  conditions: unknown[][];
  issues: { code: string; severity: string; message: string }[];
  metadata_used: { fields_get: boolean };
  error?: string;
};

/** Port of Python build_domain_report (agent_tools). */
export function buildDomain(input: {
  conditions: DomainConditionInput[];
  logical_operator?: string;
  fields_metadata?: Record<string, unknown> | null;
}): BuildDomainResult {
  const issues: BuildDomainResult["issues"] = [];
  const normalized: unknown[][] = [];
  for (let index = 0; index < input.conditions.length; index++) {
    const condition = input.conditions[index]!;
    const field = String(condition.field ?? "").trim();
    const operator = String(condition.operator ?? "").trim();
    const value = condition.value;
    if (!field) {
      issues.push({
        code: "missing_field",
        severity: "error",
        message: `condition ${index} is missing field.`,
      });
      continue;
    }
    if (!SAFE_DOMAIN_OPERATORS.has(operator)) {
      issues.push({
        code: "invalid_operator",
        severity: "error",
        message: `${JSON.stringify(operator)} is not an allowed Odoo domain operator.`,
      });
      continue;
    }
    if (input.fields_metadata != null && !(field in input.fields_metadata)) {
      issues.push({
        code: "unknown_field",
        severity: "error",
        message: `${JSON.stringify(field)} is not present in fields_get metadata.`,
      });
      continue;
    }
    if ((operator === "in" || operator === "not in") && !Array.isArray(value)) {
      issues.push({
        code: "operator_requires_list",
        severity: "error",
        message: `${JSON.stringify(operator)} requires a list value.`,
      });
      continue;
    }
    normalized.push([field, operator, value]);
  }

  const operatorName = (input.logical_operator ?? "and").trim().toLowerCase();
  if (operatorName !== "and" && operatorName !== "or") {
    issues.push({
      code: "invalid_logical_operator",
      severity: "error",
      message: "logical_operator must be 'and' or 'or'.",
    });
  }

  let domain: unknown[];
  if (operatorName === "or" && normalized.length > 1) {
    domain = Array(normalized.length - 1).fill("|").concat(normalized);
  } else {
    domain = normalized;
  }

  return {
    success: !issues.some((i) => i.severity === "error"),
    tool: "build_domain",
    domain,
    conditions: normalized,
    issues,
    metadata_used: { fields_get: input.fields_metadata != null },
  };
}
