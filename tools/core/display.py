"""
core/display.py — Rich TUI display helpers for perc
Provides consistent, beautiful terminal output across all modules.
"""

import json
import time
from datetime import datetime
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.text import Text
from rich.tree import Tree
from rich import box

console = Console()

PINK = "bright_magenta"
DIM = "dim"
SUCCESS = "bright_green"
ERROR = "bright_red"
WARNING = "bright_yellow"
INFO = "bright_cyan"


def styled_print(text: str, style: str = ""):
    """Print a styled line."""
    console.print(f"  {text}", style=style)


def success(text: str):
    console.print(f"  [bright_green][+][/] {text}")


def error(text: str):
    console.print(f"  [bright_red][-][/] {text}")


def warning(text: str):
    console.print(f"  [bright_yellow][!][/] {text}")


def info(text: str):
    console.print(f"  [bright_cyan][*][/] {text}")


def dim(text: str):
    console.print(f"  [dim]{text}[/]")


def section_header(title: str, subtitle: str = "", icon: str = ""):
    """Print a section header with an optional subtitle."""
    header = f"[bold bright_magenta]{icon} {title}[/]" if icon else f"[bold bright_magenta]{title}[/]"
    console.print(f"\n  {header}")
    if subtitle:
        console.print(f"  [dim]{subtitle}[/]")
    console.print()


def scan_header(scan_type: str, target: str):
    """Print a standardized scan header with target info."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    console.print()
    console.print(
        Panel(
            f"[bold]{scan_type}[/]\n"
            f"[dim]Target:[/]  [bold white]{target}[/]\n"
            f"[dim]Time:[/]    {now}",
            border_style=PINK,
            width=64,
            padding=(0, 2),
        )
    )


def scan_complete(elapsed: float, result_count: int = 0):
    """Print a scan completion line."""
    parts = [f"[bright_green]Scan complete[/] [dim]({elapsed:.1f}s)[/]"]
    if result_count > 0:
        parts.append(f"  [dim]{result_count} result(s)[/]")
    console.print(f"\n  {''.join(parts)}\n")


def result_table(title: str, rows: list[tuple], columns: list[str] = None, border_color: str = PINK) -> Table:
    """Create and print a styled result table.

    Args:
        title: Table title
        rows: List of tuples, each tuple is a row
        columns: Column headers. If None, auto-detect from first row.
        border_color: Border color style
    """
    tbl = Table(
        title=f"  {title}",
        title_style=f"bold {border_color}",
        border_style="dim",
        box=box.ROUNDED,
        padding=(0, 1),
        show_lines=False,
    )

    if columns:
        for col in columns:
            tbl.add_column(col, style="white", no_wrap=False)
    else:
        for i in range(len(rows[0]) if rows else 0):
            tbl.add_column(f"Col {i+1}")

    for row in rows:
        str_row = []
        for cell in row:
            if isinstance(cell, bool):
                str_row.append("[bright_green][+][/]" if cell else "[dim][-][/]")
            elif cell is None:
                str_row.append("[dim]--[/]")
            else:
                str_row.append(str(cell))
        tbl.add_row(*str_row)

    console.print(tbl)
    return tbl


def key_value_block(title: str, data: dict, border_color: str = PINK):
    """Print a key-value block in a styled panel."""
    lines = []
    max_key_len = max((len(str(k)) for k in data.keys()), default=0)
    for key, value in data.items():
        key_str = str(key).ljust(max_key_len)
        if isinstance(value, bool):
            val_str = "[bright_green]Yes[/]" if value else "[dim]No[/]"
        elif value is None or value == "":
            val_str = "[dim]--[/]"
        else:
            val_str = str(value)
        lines.append(f"  [bold]{key_str}[/]   {val_str}")

    content = "\n".join(lines)
    console.print(
        Panel(
            content,
            title=f"[bold {border_color}]{title}[/]",
            border_style=border_color,
            width=70,
            padding=(1, 1),
        )
    )


def platform_results(platforms: list[dict], title: str = "Platform Results"):
    """Print platform check results (for username/email scans).

    Each dict: {name: str, found: bool, url: str|None, extra: str|None}
    """
    found_count = sum(1 for p in platforms if p.get("found"))
    total = len(platforms)

    console.print(f"\n  [bold bright_magenta]+- {title}[/]")
    console.print(f"  [dim]|[/]")

    for p in platforms:
        name = p["name"].ljust(18)
        if p.get("found"):
            url = p.get("url", "")
            console.print(f"  [dim]|[/]  [bright_green][+][/]  {name} [dim]{url}[/]")
        else:
            console.print(f"  [dim]|[/]  [dim][-]  {name}[/]")

    console.print(f"  [dim]|[/]")
    console.print(f"  [bold bright_magenta]+- Found on {found_count}/{total} platforms[/]")
    console.print()


def progress_scanner(description: str = "Scanning"):
    """Return a Rich progress bar context manager for scanning operations."""
    return Progress(
        SpinnerColumn(style=PINK),
        TextColumn("[progress.description]{task.description}", style="bold"),
        BarColumn(bar_width=30, complete_style=PINK, finished_style="bright_green"),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    )


def tree_display(title: str, data: dict, color: str = PINK):
    """Display hierarchical data as a tree."""
    tree = Tree(f"[bold {color}]{title}[/]")
    _build_tree(tree, data)
    console.print(tree)
    console.print()


def _build_tree(node, data):
    """Recursively build a Rich tree from a dict."""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                branch = node.add(f"[bold]{key}[/]")
                _build_tree(branch, value)
            else:
                if isinstance(value, bool):
                    val_str = "[bright_green][+][/]" if value else "[dim][-][/]"
                elif value is None:
                    val_str = "[dim]--[/]"
                else:
                    val_str = str(value)
                node.add(f"[bold]{key}:[/] {val_str}")
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                _build_tree(node, item)
            else:
                node.add(str(item))


def export_json(data: Any, filepath: str):
    """Export data to a JSON file."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    success(f"Results saved to [bold]{filepath}[/]")


def export_results(data: Any, filepath: str):
    """Export results to file based on extension."""
    if filepath.endswith(".json"):
        export_json(data, filepath)
    else:
        with open(filepath, "w", encoding="utf-8") as f:
            if isinstance(data, dict):
                for key, value in data.items():
                    f.write(f"{key}: {value}\n")
            elif isinstance(data, list):
                for item in data:
                    f.write(f"{item}\n")
            else:
                f.write(str(data))
        success(f"Results saved to [bold]{filepath}[/]")
