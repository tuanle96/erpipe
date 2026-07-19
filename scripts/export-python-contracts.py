#!/usr/bin/env python3
"""Export the complete Cloud v1 (D14) Python MCP contract surface."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.metadata
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from odoo_mcp import schemas, server

CLOUD_V1_TOOLS = (
    "health_check",
    "list_models",
    "get_model_fields",
    "search_records",
    "read_record",
    "build_domain",
    "aggregate_records",
    "search_employee",
    "search_holidays",
    "get_odoo_profile",
    "schema_catalog",
    "diagnose_odoo_call",
    "diagnose_access",
    "inspect_model_relationships",
    "preview_write",
    "validate_write",
    "execute_approved_write",
    "chatter_post",
    "execute_method",
    "generate_json2_payload",
    "upgrade_risk_report",
    "fit_gap_report",
    "business_pack_report",
)


# Representative runtime samples retained from the original Phase-1 exporter.
# Every D14 schema is exported and hash-pinned; these six also validate both the
# success and error envelopes through their concrete Pydantic response model.
RUNTIME_CONTRACTS: dict[
    str, tuple[type[schemas.ToolResponse], str, dict[str, Any]]
] = {
    "health_check": (schemas.HealthCheckResponse, "server", {}),
    "list_models": (
        schemas.ListModelsResponse,
        "result",
        {
            "success": True,
            "count": 1,
            "result": [{"model": "res.partner", "name": "Contact"}],
        },
    ),
    "get_model_fields": (
        schemas.GetModelFieldsResponse,
        "result",
        {
            "success": True,
            "count": 1,
            "result": {"name": {"type": "char", "string": "Name"}},
        },
    ),
    "search_records": (
        schemas.SearchRecordsResponse,
        "result",
        {
            "success": True,
            "count": 1,
            "result": [{"id": 1, "name": "Azure"}],
            "smart_fields_applied": True,
            "fields_used": ["id", "name"],
        },
    ),
    "read_record": (
        schemas.ReadRecordResponse,
        "result",
        {
            "success": True,
            "result": {"id": 1, "name": "Azure"},
            "smart_fields_applied": True,
            "fields_used": ["id", "name"],
        },
    ),
    "build_domain": (schemas.BuildDomainResponse, "domain", {}),
}


def git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def runtime_sample(name: str, fallback: dict[str, Any]) -> dict[str, Any]:
    if name == "health_check":
        return dict(server.health_check())
    if name == "build_domain":
        return dict(
            server.build_domain(
                [{"field": "name", "operator": "ilike", "value": "azure"}]
            )
        )
    return fallback


async def export(repo: Path) -> dict[str, Any]:
    listed = {tool.name: tool for tool in await server.mcp.list_tools()}
    exported: dict[str, Any] = {}
    for name in CLOUD_V1_TOOLS:
        tool = listed.get(name)
        if tool is None:
            raise RuntimeError(f"Python tools/list is missing {name}")
        input_schema = tool.inputSchema
        output_schema = tool.outputSchema
        if not isinstance(input_schema, dict):
            raise RuntimeError(f"{name} has no inputSchema")
        if not isinstance(output_schema, dict):
            raise RuntimeError(f"{name} has no outputSchema")

        runtime_verified = {"success": False, "error": False}
        runtime_contract = RUNTIME_CONTRACTS.get(name)
        if runtime_contract is not None:
            model, marker, fallback = runtime_contract
            properties = output_schema.get("properties", {})
            required = {"success", "error", marker}
            missing = required - properties.keys()
            if missing:
                raise RuntimeError(
                    f"{name} outputSchema is missing {sorted(missing)}"
                )
            success = model.model_validate(runtime_sample(name, fallback))
            error = model.model_validate(
                {"success": False, "tool": name, "error": "contract-test"}
            )
            if not success.success or error.success:
                raise RuntimeError(
                    f"{name} runtime validation returned the wrong state"
                )
            runtime_verified = {"success": True, "error": True}

        required_fields = output_schema.get("required", [])
        structured_content_mode = (
            "wrapped"
            if required_fields == ["result"]
            and set(output_schema.get("properties", {})) == {"result"}
            else "direct"
        )

        exported[name] = {
            "input_schema": input_schema,
            "input_schema_sha256": canonical_hash(input_schema),
            "output_schema": output_schema,
            "output_schema_sha256": canonical_hash(output_schema),
            "runtime_verified": runtime_verified,
            "structured_content_mode": structured_content_mode,
        }

    return {
        "manifest_version": 2,
        "tier": "cloud-v1-d14",
        "tool_count": len(exported),
        "source": {
            "package": "odoo-mcp",
            "package_version": importlib.metadata.version("odoo-mcp"),
            "behavior_tag": "v1.2.1",
            "behavior_commit": git(repo, "rev-list", "-n", "1", "v1.2.1"),
            "schema_source_commit": git(repo, "rev-parse", "HEAD"),
            "python": sys.version.split()[0],
            "mcp": importlib.metadata.version("mcp"),
            "pydantic": importlib.metadata.version("pydantic"),
        },
        "tools": exported,
    }


def typescript_module(manifest: dict[str, Any]) -> str:
    """Render the runtime subset consumed by both TypeScript Workers."""
    generated = {
        "source": manifest["source"],
        "tier": manifest["tier"],
        "tool_count": manifest["tool_count"],
        "tools": manifest["tools"],
    }
    payload = json.dumps(generated, indent=2, sort_keys=True)
    return (
        "/* Generated by scripts/export-python-contracts.py. Do not edit. */\n"
        f"export const CLOUD_V1_PYTHON_CONTRACTS = {payload} as const;\n\n"
        "export type CloudV1ToolName = "
        "keyof typeof CLOUD_V1_PYTHON_CONTRACTS.tools;\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mcp-odoo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path)
    args = parser.parse_args()
    manifest = asyncio.run(export(args.mcp_odoo.resolve()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    if args.typescript_output:
        args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
        args.typescript_output.write_text(
            typescript_module(manifest), encoding="utf-8"
        )
    print(
        f"verified {manifest['tool_count']} contracts from "
        f"{manifest['source']['schema_source_commit']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
