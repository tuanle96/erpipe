/**
 * Simplified port of Python field_policy.FieldPolicy (deny/allow per model).
 */

export type ModelFieldRule = {
  mode: "deny" | "allow";
  fields: string[];
};

/** Shape: { field_acl: { [instance]: { [model|"*"]: { mode, fields } } } } */
export type FieldPolicyDoc = {
  field_acl?: Record<string, Record<string, { mode?: string; fields?: string[] }>>;
};

const ALWAYS_KEPT = new Set(["id", "display_name"]);

export class FieldPolicy {
  private readonly byInstance: Map<string, Map<string, ModelFieldRule>>;

  constructor(byInstance: Map<string, Map<string, ModelFieldRule>> = new Map()) {
    this.byInstance = byInstance;
  }

  static fromDoc(doc: FieldPolicyDoc | null | undefined): FieldPolicy {
    const by = new Map<string, Map<string, ModelFieldRule>>();
    const acl = doc?.field_acl ?? {};
    for (const [instance, models] of Object.entries(acl)) {
      const m = new Map<string, ModelFieldRule>();
      for (const [model, rule] of Object.entries(models ?? {})) {
        const mode = rule.mode === "allow" ? "allow" : "deny";
        m.set(model, { mode, fields: [...(rule.fields ?? [])] });
      }
      by.set(instance, m);
    }
    return new FieldPolicy(by);
  }

  active(): boolean {
    return this.byInstance.size > 0;
  }

  private effective(
    instance: string,
    model: string,
  ): { allow: Set<string> | null; deny: Set<string> } | null {
    const models = this.byInstance.get(instance);
    if (!models) return null;
    const star = models.get("*");
    const specific = models.get(model);
    if (!star && !specific) return null;
    let allow: Set<string> | null = null;
    const deny = new Set<string>();
    for (const rule of [star, specific]) {
      if (!rule) continue;
      if (rule.mode === "deny") {
        for (const f of rule.fields) deny.add(f);
      } else if (allow == null) {
        allow = new Set<string>(rule.fields);
      } else {
        const next = new Set<string>();
        for (const f of allow) {
          if (rule.fields.includes(f)) next.add(f);
        }
        allow = next;
      }
    }
    return { allow, deny };
  }

  /** Fields in values that policy forbids writing. */
  deniedWriteFields(
    instance: string,
    model: string,
    fieldNames: string[],
  ): string[] {
    const eff = this.effective(instance, model);
    if (!eff) return [];
    const denied: string[] = [];
    for (const name of fieldNames) {
      if (ALWAYS_KEPT.has(name)) continue;
      if (eff.allow != null && !eff.allow.has(name)) denied.push(name);
      else if (eff.deny.has(name)) denied.push(name);
    }
    return denied;
  }

  checkWriteValues(
    instance: string,
    model: string,
    values: Record<string, unknown>,
  ): string | null {
    const denied = this.deniedWriteFields(instance, model, Object.keys(values));
    if (!denied.length) return null;
    return `Field policy denies write access to ${JSON.stringify(denied)} on ${model}`;
  }
}
