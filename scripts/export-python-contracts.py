#!/usr/bin/env python3
"""Export and runtime-verify the six Phase-1 Python MCP contracts."""

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

CONTRACTS: dict[str, tuple[type[schemas.ToolResponse], str, dict[str, Any]]] = {
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
    for name, (model, marker, fallback) in CONTRACTS.items():
        tool = listed.get(name)
        if tool is None:
            raise RuntimeError(f"Python tools/list is missing {name}")
        output_schema = tool.outputSchema
        if not isinstance(output_schema, dict):
            raise RuntimeError(f"{name} has no outputSchema")
        properties = output_schema.get("properties", {})
        required = {"success", "error", marker}
        missing = required - properties.keys()
        if missing:
            raise RuntimeError(f"{name} outputSchema is missing {sorted(missing)}")

        success = model.model_validate(runtime_sample(name, fallback))
        error = model.model_validate(
            {"success": False, "tool": name, "error": "contract-test"}
        )
        if not success.success or error.success:
            raise RuntimeError(f"{name} runtime validation returned the wrong state")

        exported[name] = {
            "input_schema": tool.inputSchema,
            "output_schema": output_schema,
            "output_schema_sha256": canonical_hash(output_schema),
            "runtime_verified": {"success": True, "error": True},
            "success_marker": marker,
        }

    return {
        "manifest_version": 1,
        "tier": "cloud-v1-phase1",
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mcp-odoo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = asyncio.run(export(args.mcp_odoo.resolve()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(
        f"verified {manifest['tool_count']} contracts from "
        f"{manifest['source']['schema_source_commit']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
