"""Offline Phase-1 probes: execute selected existing functions with fake I/O.

No application imports, environment loading, network, database, or business writes.
Run from any directory: python scripts/audit_zoho_baseline.py
These counts are synthetic baseline evidence, not production API consumption.
"""
from __future__ import annotations

import ast
import json
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


class ZohoError(Exception):
    pass


def functions(path, names, namespace):
    tree = ast.parse((ROOT / path).read_text(encoding="utf-8-sig"))
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    assert {n.name for n in nodes} == set(names)
    for node in nodes:
        node.decorator_list = []
    module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), *nodes], type_ignores=[])
    exec(compile(ast.fix_missing_locations(module), path, "exec"), namespace)


def main():
    result = {"mode": "offline synthetic baseline", "network_calls": 0}
    calls = Counter()
    lock = threading.Lock()

    def fetch(oid):
        with lock:
            calls[oid] += 1
        return {"salesorder": {"salesorder_id": oid}}

    ns = dict(ThreadPoolExecutor=ThreadPoolExecutor, as_completed=as_completed,
              ZohoError=ZohoError, _DETAIL_CAP=80)
    functions("backend/routers/reports.py", ["_detail_record", "_detail_map"], ns)
    for ids in [["100", "101", "102"], ["101", "102", "103"], ["102", "103", "104"]]:
        ns["_detail_map"](ids, fetch, "salesorder", 3, {})
    result["report_three_overlapping_buckets"] = {
        "detail_calls": sum(calls.values()), "unique_ids": len(calls),
        "duplicate_calls": sum(calls.values()) - len(calls),
    }
    calls.clear()
    ns["_detail_map"](["same"] * 80 + ["outside-cap"], fetch, "salesorder", 3, {})
    result["report_cap_before_dedup"] = dict(calls)

    builds = 0

    def build(section=None):
        nonlocal builds
        with lock:
            builds += 1
        time.sleep(0.02)
        return {"section": section}

    ns.update(time=time, _cache_lock=threading.Lock(), _CACHE_TTL_SECONDS=60, _build_report=build)
    functions("backend/routers/reports.py", ["get_rgf_logistics_report"], ns)
    for label, kwargs in [("normal", {}), ("forced", {"force": True}), ("section", {"section": "packages"})]:
        builds = 0
        ns["_cache"] = {"payload": None, "fetched_at": 0.0}
        gate = threading.Barrier(3)

        def run():
            gate.wait(timeout=5)
            return ns["get_rgf_logistics_report"](**kwargs)

        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = [pool.submit(run) for _ in range(3)]
            for future in futures:
                future.result()
        result[f"three_concurrent_{label}_report_requests"] = {"builds": builds}

    live = dict(fetch_sales_order_detail=fetch, ZohoError=ZohoError,
                _assigned_zoho={}, _build_transient=lambda r: SimpleNamespace(**r),
                _apply_assignment=lambda row: row)
    functions("backend/services/live_sales_order_cache.py", ["ensure_zoho_data", "refresh_zoho_data"], live)
    cached = SimpleNamespace(order_status="acknowledged", raw_json={}, synced_at=None)
    lp = dict(fetch_sales_order_detail=fetch, ZohoError=ZohoError,
              live_sales_order_cache=SimpleNamespace(find_cached=lambda oid: cached,
                  ensure_zoho_data=live["ensure_zoho_data"], refresh_zoho_data=live["refresh_zoho_data"],
                  invalidate_windows=lambda: None),
              sales_order_delivery_status=lambda r: "Pending",
              remove_acknowledge_sales_order=lambda oid: calls.update({"POST": 1}))
    functions("backend/routers/load_planning.py", ["get_sales_order", "remove_acknowledge_sales_order_route"], lp)
    for label, name in [("inventory_detail_drawer", "get_sales_order"), ("remove_acknowledgement", "remove_acknowledge_sales_order_route")]:
        calls.clear()
        lp[name]("123")
        result[label] = {"detail_gets": calls["123"], "status_posts": calls["POST"]}

    log_paths = [ROOT / "applciation_run.txt", *sorted((ROOT / "artifacts/intellifleet").glob("*.log"))]
    result["available_log_evidence"] = [
        {"file": str(path.relative_to(ROOT)), "zoho_endpoint_lines": sum("[ZOHO]" in line and "endpoint=" in line for line in path.read_text(encoding="utf-8", errors="replace").splitlines())}
        for path in log_paths if path.is_file()
    ]
    assert result["report_three_overlapping_buckets"]["detail_calls"] == 9
    assert result["three_concurrent_normal_report_requests"]["builds"] == 1
    assert result["three_concurrent_forced_report_requests"]["builds"] == 3
    assert result["three_concurrent_section_report_requests"]["builds"] == 3
    assert result["inventory_detail_drawer"]["detail_gets"] == 2
    assert result["remove_acknowledgement"]["detail_gets"] == 2
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
