#!/usr/bin/env python3
"""Run pure cloud-v1 parity cases against Python mcp-odoo.

Reads corpus JSON path as argv[1], prints JSON results to stdout.
Requires odoo_mcp importable (pip install -e /path/to/mcp-odoo or PYTHONPATH).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def _run_case(case: dict[str, Any]) -> Any:
    tool = case["tool"]
    inp = case.get("input") or {}

    if tool == "generate_json2_payload":
        from odoo_mcp.diagnostics import generate_json2_payload_report

        return generate_json2_payload_report(
            model=inp["model"],
            method=inp["method"],
            args=inp.get("args"),
            kwargs=inp.get("kwargs"),
            base_url=inp.get("base_url"),
            database=inp.get("database"),
            include_database_header=inp.get("include_database_header", True),
        )

    if tool == "upgrade_risk_report":
        from odoo_mcp.diagnostics import upgrade_risk_report

        return upgrade_risk_report(
            source_version=inp.get("source_version"),
            target_version=inp.get("target_version"),
            modules=inp.get("modules"),
            methods=inp.get("methods"),
            source_findings=inp.get("source_findings"),
            observed_errors=inp.get("observed_errors"),
            include_debug=bool(inp.get("include_debug", False)),
        )

    if tool == "fit_gap_report":
        from odoo_mcp.diagnostics import fit_gap_report

        return fit_gap_report(
            requirements=inp["requirements"],
            available_models=inp.get("available_models"),
            available_fields=inp.get("available_fields"),
            installed_modules=inp.get("installed_modules"),
            business_context=inp.get("business_context"),
        )

    if tool == "business_pack_report":
        from odoo_mcp.agent_tools import business_pack_report

        return business_pack_report(
            pack=inp["pack"],
            available_models=inp.get("available_models"),
            installed_modules=inp.get("installed_modules"),
        )

    if tool == "build_domain":
        from odoo_mcp.agent_tools import build_domain_report

        return build_domain_report(
            conditions=inp["conditions"],
            logical_operator=inp.get("logical_operator", "and"),
            fields_metadata=inp.get("fields_metadata"),
        )

    if tool == "preview_write":
        from odoo_mcp.agent_tools import build_write_preview_report

        return build_write_preview_report(
            model=inp["model"],
            operation=inp["operation"],
            values=inp.get("values"),
            values_list=inp.get("values_list"),
            record_ids=inp.get("record_ids"),
            context=inp.get("context"),
            instance=inp.get("instance", "default"),
        )

    if tool == "prompt":
        name = inp["name"]
        args = inp.get("args") or {}
        from odoo_mcp import prompts, prompts_workflows

        mapping = {
            "diagnose_failed_odoo_call": (
                prompts.prompt_diagnose_failed_odoo_call,
                ("model", "method", "error"),
            ),
            "fit_gap_workshop": (prompts.prompt_fit_gap_workshop, ("requirement",)),
            "json2_migration_plan": (
                prompts.prompt_json2_migration_plan,
                ("model", "method"),
            ),
            "safe_write_review": (
                prompts.prompt_safe_write_review,
                ("model", "operation"),
            ),
            "invoice_approval_chain": (
                prompts_workflows.prompt_invoice_approval_chain,
                ("journal", "date_from", "date_to"),
            ),
            "po_to_receipt": (
                prompts_workflows.prompt_po_to_receipt,
                ("purchase_order",),
            ),
            "customer_onboarding": (
                prompts_workflows.prompt_customer_onboarding,
                ("company_name", "email", "vat"),
            ),
        }
        if name not in mapping:
            return {"error": f"unknown prompt {name}"}
        fn, keys = mapping[name]
        kwargs = {k: args.get(k, "") for k in keys}
        # Drop empty optionals so defaults apply
        call_kwargs = {}
        for k, v in kwargs.items():
            if k in ("model", "method", "requirement", "operation", "purchase_order", "company_name"):
                call_kwargs[k] = v
            elif v:
                call_kwargs[k] = v
        return {"text": fn(**call_kwargs)}

    return {"error": f"unsupported tool {tool}"}


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: run_python_side.py <corpus.json>", file=sys.stderr)
        return 2
    corpus_path = Path(sys.argv[1])
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    results: dict[str, Any] = {}
    for case in corpus["cases"]:
        case_id = case["id"]
        try:
            results[case_id] = {"ok": True, "result": _run_case(case)}
        except Exception as exc:  # noqa: BLE001 — harness surfaces errors
            results[case_id] = {
                "ok": False,
                "error": f"{type(exc).__name__}: {exc}",
            }
    print(json.dumps(results, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
