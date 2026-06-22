"""
modules/osint/image.py — Image EXIF & GEOINT extraction
Extracts EXIF metadata and GPS coordinates from images using Pillow.
Converts DMS (degrees/minutes/seconds) to decimal for mapping.
"""

import os
import time
from typing import Any

try:
    from PIL import Image
    from PIL.ExifTags import TAGS, GPSTAGS
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

from core.display import (
    console, success, error, warning, info, scan_header, scan_complete,
    key_value_block, section_header,
)


def _dms_to_decimal(dms_tuple: tuple, ref: str) -> float | None:
    """Convert GPS DMS (degrees, minutes, seconds) to decimal degrees.

    Args:
        dms_tuple: Tuple of (degrees, minutes, seconds) — each may be
                   a float or an IFDRational.
        ref: Reference direction ('N', 'S', 'E', 'W').

    Returns:
        Decimal degrees as a float, negative for S/W.
    """
    try:
        degrees = float(dms_tuple[0])
        minutes = float(dms_tuple[1])
        seconds = float(dms_tuple[2])

        decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)

        if ref in ("S", "W"):
            decimal = -decimal

        return round(decimal, 7)
    except (TypeError, IndexError, ValueError, ZeroDivisionError):
        return None


def _extract_gps_data(gps_info: dict) -> dict[str, Any]:
    """Parse GPS EXIF IFD into a clean dict with decimal coordinates."""
    # Decode numeric GPS tag keys to human-readable names
    decoded: dict[str, Any] = {}
    for tag_id, value in gps_info.items():
        tag_name = GPSTAGS.get(tag_id, str(tag_id))
        decoded[tag_name] = value

    result: dict[str, Any] = {
        "raw": {},
        "latitude": None,
        "longitude": None,
        "altitude": None,
        "maps_url": None,
    }

    # Store raw GPS values
    for k, v in decoded.items():
        try:
            result["raw"][k] = str(v)
        except Exception:
            result["raw"][k] = repr(v)

    # Latitude
    lat_dms = decoded.get("GPSLatitude")
    lat_ref = decoded.get("GPSLatitudeRef", "N")
    if lat_dms:
        result["latitude"] = _dms_to_decimal(lat_dms, lat_ref)

    # Longitude
    lon_dms = decoded.get("GPSLongitude")
    lon_ref = decoded.get("GPSLongitudeRef", "E")
    if lon_dms:
        result["longitude"] = _dms_to_decimal(lon_dms, lon_ref)

    # Altitude
    alt = decoded.get("GPSAltitude")
    alt_ref = decoded.get("GPSAltitudeRef", 0)
    if alt is not None:
        try:
            alt_val = float(alt)
            # GPSAltitudeRef: 0 = above sea level, 1 = below
            if alt_ref == 1:
                alt_val = -alt_val
            result["altitude"] = round(alt_val, 2)
        except (TypeError, ValueError):
            pass

    # Google Maps link
    if result["latitude"] is not None and result["longitude"] is not None:
        result["maps_url"] = (
            f"https://www.google.com/maps?q={result['latitude']},{result['longitude']}"
        )

    return result


def scan_image(filepath: str) -> dict:
    """Extract EXIF metadata and GPS data from an image file.

    Args:
        filepath: Path to the image file.

    Returns:
        Dict with image dimensions, EXIF metadata, GPS data, and camera info.
    """
    scan_header("Image EXIF / GEOINT Extraction", filepath)
    start = time.time()

    if not HAS_PILLOW:
        error("Pillow library is not installed — run: pip install Pillow")
        return {"error": "Pillow not installed", "target": filepath}

    # Validate file existence
    if not os.path.isfile(filepath):
        error(f"File not found: [bold]{filepath}[/bold]")
        return {"error": "File not found", "target": filepath}

    results: dict[str, Any] = {
        "scan_type": "image_exif",
        "target": filepath,
        "filename": os.path.basename(filepath),
        "file_size_bytes": os.path.getsize(filepath),
    }

    try:
        img = Image.open(filepath)
    except Exception as exc:
        error(f"Failed to open image: {exc}")
        results["error"] = str(exc)
        return results

    # ── Basic image info ───────────────────────────────────────
    results["format"] = img.format
    results["mode"] = img.mode
    results["width"] = img.size[0]
    results["height"] = img.size[1]

    basic_display: dict[str, Any] = {
        "Filename": results["filename"],
        "File Size": f"{results['file_size_bytes']:,} bytes",
        "Format": img.format or "Unknown",
        "Color Mode": img.mode,
        "Dimensions": f"{img.size[0]} × {img.size[1]} px",
    }
    key_value_block("Image Info", basic_display)

    # ── EXIF data ──────────────────────────────────────────────
    exif_data = {}
    gps_info = {}

    try:
        raw_exif = img._getexif()
    except (AttributeError, Exception):
        raw_exif = None

    if raw_exif is None:
        warning("No EXIF data found in this image")
        results["exif"] = None
        results["gps"] = None
    else:
        info("EXIF data found — extracting …")

        for tag_id, value in raw_exif.items():
            tag_name = TAGS.get(tag_id, str(tag_id))

            # GPS info is nested — handle separately
            if tag_name == "GPSInfo":
                gps_info = value
                continue

            # Store serializable values
            try:
                if isinstance(value, bytes):
                    exif_data[tag_name] = value.hex()[:40]
                elif isinstance(value, tuple) and len(value) > 10:
                    exif_data[tag_name] = str(value)[:60] + "…"
                else:
                    exif_data[tag_name] = str(value)
            except Exception:
                exif_data[tag_name] = repr(value)[:60]

        results["exif"] = exif_data

        # ── Camera / software metadata ────────────────────────
        camera_display: dict[str, Any] = {}

        camera_fields = {
            "Make": "Camera Make",
            "Model": "Camera Model",
            "Software": "Software",
            "DateTime": "Date/Time",
            "DateTimeOriginal": "Date/Time Original",
            "DateTimeDigitized": "Date/Time Digitized",
            "ExposureTime": "Exposure Time",
            "FNumber": "F-Number",
            "ISOSpeedRatings": "ISO Speed",
            "FocalLength": "Focal Length",
            "FocalLengthIn35mmFilm": "Focal Length (35mm eq.)",
            "Flash": "Flash",
            "WhiteBalance": "White Balance",
            "LensModel": "Lens Model",
            "LensMake": "Lens Make",
            "Orientation": "Orientation",
            "ImageDescription": "Description",
            "Artist": "Artist",
            "Copyright": "Copyright",
            "ExifImageWidth": "EXIF Width",
            "ExifImageHeight": "EXIF Height",
        }

        for exif_key, display_label in camera_fields.items():
            if exif_key in exif_data and exif_data[exif_key]:
                camera_display[display_label] = exif_data[exif_key]

        if camera_display:
            key_value_block("Camera & Metadata", camera_display)
        else:
            info("No camera metadata fields found in EXIF")

        # ── GPS / GEOINT ──────────────────────────────────────
        if gps_info:
            gps_result = _extract_gps_data(gps_info)
            results["gps"] = gps_result

            gps_display: dict[str, Any] = {}

            if gps_result["latitude"] is not None:
                gps_display["Latitude"] = f"{gps_result['latitude']}°"
            if gps_result["longitude"] is not None:
                gps_display["Longitude"] = f"{gps_result['longitude']}°"
            if gps_result["altitude"] is not None:
                gps_display["Altitude"] = f"{gps_result['altitude']} m"
            if gps_result["maps_url"]:
                gps_display["Google Maps"] = gps_result["maps_url"]

            if gps_display:
                key_value_block("GPS / GEOINT", gps_display, border_color="bright_green")
                success(
                    f"GPS coordinates found: "
                    f"[bold]{gps_result['latitude']}, {gps_result['longitude']}[/bold]"
                )
                info(f"Maps: [link={gps_result['maps_url']}]{gps_result['maps_url']}[/link]")
            else:
                info("GPS IFD present but no usable coordinate data")
        else:
            results["gps"] = None
            info("No GPS data embedded in this image")

    img.close()

    elapsed = time.time() - start
    scan_complete(elapsed)
    results["elapsed_seconds"] = round(elapsed, 2)

    return results
