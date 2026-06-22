"""
core/banner.py — ASCII art banner and branding for perc
"""

from rich.console import Console
from rich.text import Text
from rich.panel import Panel
from core import __version__

console = Console()

BANNER_LINES = [
    "                                        ",
    "       _..---\"\"\"\"---.._                 ##m###m    m####m    ##m####   m#####m",
    "      |`'''--------'''`|                ##\"  \"##  ##mmmm##   ##\"      ##\"    \"",
    "      |_              _|                ##    ##  ##\"\"\"\"\"\"   ##       ##      ",
    "      L_`'''------'''`_d                ###mm##\"  \"##mmmm#   ##       \"##mmmm#",
    "       |`'''------'''`|                 ## \"\"\"      \"\"\"\"\"    \"\"         \"\"\"\"\" ",
    "       |             _|                 ##                                    ",
    "       |''---,,,,-, | |                                                      ",
    "       |   PERC   | | |                                                      ",
    "       |FRAMEWORK | | |                                                      ",
    "       | by: xtyi | | |                                                      ",
    "       |''---,,,,-'  \"|                                                      ",
    "       |              |                                                      ",
    "       `''---,,,,---''`                                                      ",
]

MODULE_INFO = {
    "osint": {
        "name": "OSINT Framework",
        "desc": "Reconnaissance and intelligence gathering",
        "color": "bright_green",
    },
    "payload": {
        "name": "Payload Builder",
        "desc": "Reverse shells, droppers, obfuscation",
        "color": "bright_yellow",
    },
    "breach": {
        "name": "Breach Engine",
        "desc": "Offline credential and database search",
        "color": "bright_red",
    },
}


def print_banner():
    """Print the main perc banner with version info."""
    banner_text = Text()
    for line in BANNER_LINES:
        # Color the pill art pink, the block letters white
        if "##" in line:
            parts = line.split("##", 1)
            pill_part = parts[0]
            block_part = "##" + parts[1]
            banner_text.append(pill_part, style="bright_magenta")
            banner_text.append(block_part, style="bold white")
        elif any(kw in line for kw in ["PERC", "FRAMEWORK", "xtyi", "---", "'''", "_d", "_|", "|`", "`|"]):
            banner_text.append(line, style="bright_magenta")
        else:
            banner_text.append(line, style="dim")
        banner_text.append("\n")

    console.print(banner_text)
    console.print(
        f"  [bright_magenta]PERC[/] [dim]—[/] Intelligence Framework [dim]v{__version__}[/]",
    )
    console.print()


def print_help():
    """Print the full help / usage screen."""
    print_banner()

    console.print("  [bold]Usage:[/]  perc [option] <target>\n")

    console.print("  [bright_magenta]OSINT[/]")
    console.print("    -u,  --username  <name>       Search username across platforms")
    console.print("    -e,  --email     <addr>       Email reconnaissance")
    console.print("    -p,  --phone     <num>        Phone number lookup")
    console.print("    -ip              <addr>       IP geolocation & threat intel")
    console.print("    -d,  --domain    <domain>     Domain recon, DNS, WHOIS")
    console.print("    -img             <path>       Image EXIF & GEOINT extraction")
    console.print("         --dork      <target>     Google dork generation")
    console.print("         --dork      <target> -c <cat>  Dorks by category")
    console.print()

    console.print("  [bright_yellow]PAYLOADS[/]")
    console.print("         --payload   <type>       Generate a payload")
    console.print("         --payload   list         Show all payload types")
    console.print("         --payload   interactive  Guided payload wizard")
    console.print()

    console.print("  [bright_red]BREACH[/]")
    console.print("         --breach    <target>     Search breach database")
    console.print("         --breach-import <file>   Import breach data file")
    console.print("         --breach-stats           Show database statistics")
    console.print()

    console.print("  [dim]UTILITY[/]")
    console.print("         --config                 Open config editor")
    console.print("         --version                Show version")
    console.print("         --modules                List active modules")
    console.print("    -o   <file>                   Save output to file")
    console.print("    -q,  --quiet                  Suppress banner output")
    console.print("         --json                   Output as JSON")
    console.print()

    console.print("  [dim]Dork categories: social, documents, login, directories,[/dim]")
    console.print("  [dim]databases, email, phone, personal, credentials, subdomains, all[/dim]")
    console.print()


def print_module_header(module_id: str):
    """Print a styled header for a specific module."""
    info = MODULE_INFO.get(module_id, {"name": module_id, "desc": "", "color": "white"})
    console.print(
        Panel(
            f"[bold]{info['name']}[/bold]\n[dim]{info['desc']}[/dim]",
            border_style=info["color"],
            width=60,
            padding=(0, 2),
        )
    )
