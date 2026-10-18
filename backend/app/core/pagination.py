def page(items: list, limit: int, offset: int) -> tuple[list, dict]:
    """Slice an already-filtered list. SQL repositories should apply LIMIT in the query."""
    safe_limit = min(max(limit, 1), 50)
    safe_offset = max(offset, 0)
    return items[safe_offset : safe_offset + safe_limit], {
        "limit": safe_limit,
        "offset": safe_offset,
        "total": len(items),
    }
