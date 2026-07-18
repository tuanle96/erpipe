/**
 * Domain list validation helpers (build_domain parity — full port later).
 * Odoo domain is a list of tuples / operators; we only do shallow shape checks for now.
 */

export function isDomainList(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function assertDomainList(value: unknown): unknown[] {
  if (!isDomainList(value)) {
    throw new TypeError("domain must be a list");
  }
  return value;
}
