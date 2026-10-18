"""Records keep their media as a JSON list of {"id", "kind"} refs in a TEXT column."""

import json


def dump_refs(refs: list[dict] | None) -> str:
    return json.dumps([{"id": ref["id"], "kind": ref["kind"]} for ref in refs or []])


def load_refs(text: str | None) -> list[dict]:
    if not text:
        return []
    try:
        value = json.loads(text)
    except ValueError:
        return []
    return [ref for ref in value if isinstance(ref, dict) and "id" in ref and "kind" in ref] if isinstance(value, list) else []
