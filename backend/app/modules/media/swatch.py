"""Small PNG photos for seeded grocery items, properties, and image shorts."""

from __future__ import annotations

import base64
import struct
import zlib

_PNG = b"\x89PNG\r\n\x1a\n"


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png_swatch(top: tuple[int, int, int], bottom: tuple[int, int, int], width: int = 480, height: int = 320) -> bytes:
    split = height // 2
    rows: list[bytes] = []
    for y in range(height):
        color = top if y < split else bottom
        rows.append(b"\x00" + bytes(color) * width)
    return (
        _PNG
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + _chunk(b"IEND", b"")
    )


def data_url(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> str:
    return "data:image/png;base64," + base64.b64encode(png_swatch(top, bottom)).decode("ascii")
