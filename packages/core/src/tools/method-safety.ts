/**
 * Method safety classification shared by upgrade-risk / diagnose tools.
 */

const READ_ONLY_METHODS = new Set([
  "search",
  "search_count",
  "search_read",
  "read",
  "fields_get",
  "name_get",
  "name_search",
  "context_get",
]);
const DESTRUCTIVE_METHODS = new Set(["create", "write", "unlink"]);
const SIDE_EFFECT_PATTERNS = [
  /^action_/,
  /^button_/,
  /(^|_)send($|_)/,
  /(^|_)post($|_)/,
  /(^|_)validate($|_)/,
];

export function classifyMethodSafety(method: string): {
  safety: string;
  destructive_method: boolean;
  confidence: string;
} {
  if (DESTRUCTIVE_METHODS.has(method)) {
    return {
      safety: "destructive",
      destructive_method: true,
      confidence: "high",
    };
  }
  if (READ_ONLY_METHODS.has(method) || method.startsWith("get_") || method.startsWith("_get_")) {
    return {
      safety: "read_only",
      destructive_method: false,
      confidence: READ_ONLY_METHODS.has(method) ? "high" : "medium",
    };
  }
  if (method === "message_post" || SIDE_EFFECT_PATTERNS.some((p) => p.test(method))) {
    return {
      safety: "side_effect",
      destructive_method: false,
      confidence: "medium",
    };
  }
  return {
    safety: "unknown",
    destructive_method: false,
    confidence: "low",
  };
}
