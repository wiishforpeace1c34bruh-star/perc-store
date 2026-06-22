"""
modules/payload/builder.py — Interactive and quick payload builder
"""

import sys
from rich.prompt import Prompt, Confirm
from core.display import console, success, error, info, warning, section_header, result_table, key_value_block
from modules.payload.shells import get_shell, list_shells
from modules.payload.macros import list_macros, generate_macro
from modules.payload.obfuscate import obfuscate, list_obfuscation_methods


def interactive_builder() -> dict | None:
    """Guided wizard for payload generation."""
    section_header("Payload Builder Wizard", "Interactive payload generation and obfuscation")

    payload_type = Prompt.ask(
        "  [bold]Select payload category[/]",
        choices=["shell", "macro"],
        default="shell"
    )
    console.print()

    if payload_type == "shell":
        shells = list_shells()
        for i, s in enumerate(shells, 1):
            console.print(f"  [bright_magenta]{i}[/] [bold]{s['type'].ljust(20)}[/] {s['description']}")
        
        console.print()
        choice = Prompt.ask("  [bold]Select shell type[/]", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(shells):
                shell_id = shells[idx]["type"]
            else:
                error("Invalid selection")
                return None
        except ValueError:
            error("Invalid selection")
            return None

        lhost = Prompt.ask("  [bold]Listener Host (LHOST)[/]")
        lport = Prompt.ask("  [bold]Listener Port (LPORT)[/]", default="4444")
        
        try:
            lport = int(lport)
        except ValueError:
            error("Invalid port")
            return None
            
        raw_payload = get_shell(shell_id, lhost, lport)
        if not raw_payload:
            error("Failed to generate shell")
            return None
            
        metadata = {"type": shell_id, "lhost": lhost, "lport": lport}

    elif payload_type == "macro":
        macros = list_macros()
        for i, m in enumerate(macros, 1):
            console.print(f"  [bright_yellow]{i}[/] [bold]{m['id'].ljust(20)}[/] {m['description']}")
            
        console.print()
        choice = Prompt.ask("  [bold]Select macro type[/]", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(macros):
                macro_id = macros[idx]["id"]
            else:
                error("Invalid selection")
                return None
        except ValueError:
            error("Invalid selection")
            return None

        if macro_id in ["vba_dropper", "hta_dropper"]:
            target = Prompt.ask("  [bold]Target Download URL[/]")
        else:
            target = Prompt.ask("  [bold]Command to execute[/]")
            
        raw_payload = generate_macro(macro_id, target)
        if not raw_payload:
            error("Failed to generate macro")
            return None
            
        metadata = {"type": macro_id, "target": target}

    console.print()
    if Confirm.ask("  [bold]Apply obfuscation?[/]", default=False):
        methods = list_obfuscation_methods()
        for i, m in enumerate(methods, 1):
            console.print(f"  [bright_cyan]{i}[/] [bold]{m['id'].ljust(20)}[/] {m['description']}")
            
        console.print()
        choices = Prompt.ask("  [bold]Select methods (comma separated, in order)[/]")
        selected_methods = []
        for c in choices.split(","):
            try:
                idx = int(c.strip()) - 1
                if 0 <= idx < len(methods):
                    selected_methods.append(methods[idx]["id"])
            except ValueError:
                pass
                
        if selected_methods:
            obf_result = obfuscate(raw_payload, selected_methods)
            final_payload = obf_result["obfuscated"]
            metadata["obfuscation"] = obf_result["methods_applied"]
        else:
            final_payload = raw_payload
    else:
        final_payload = raw_payload

    console.print()
    section_header("Generated Payload")
    
    from rich.syntax import Syntax
    # Guess lexer based on type
    lexer = "bash"
    if "powershell" in metadata["type"]: lexer = "powershell"
    elif "python" in metadata["type"]: lexer = "python"
    elif "php" in metadata["type"]: lexer = "php"
    elif "ruby" in metadata["type"]: lexer = "ruby"
    elif "vba" in metadata["type"]: lexer = "vbnet"
    elif "hta" in metadata["type"]: lexer = "html"
    
    console.print(Syntax(final_payload, lexer, theme="monokai", line_numbers=False, word_wrap=True))
    console.print()
    
    if Confirm.ask("  [bold]Save payload to file?[/]", default=False):
        filename = Prompt.ask("  [bold]Filename[/]", default="payload.txt")
        try:
            with open(filename, "w", encoding="utf-8") as f:
                f.write(final_payload)
            success(f"Payload saved to [bold]{filename}[/]")
        except Exception as e:
            error(f"Failed to save: {e}")

    result = metadata.copy()
    result["payload"] = final_payload
    return result


def quick_payload(payload_type: str, lhost: str, lport: int) -> dict | None:
    """Non-interactive payload generation."""
    shells = [s["type"] for s in list_shells()]
    
    if payload_type in shells:
        raw_payload = get_shell(payload_type, lhost, lport)
        if not raw_payload:
            error(f"Shell type '{payload_type}' generation failed.")
            return None
            
        section_header(f"Payload: {payload_type}")
        
        lexer = "bash"
        if "powershell" in payload_type: lexer = "powershell"
        elif "python" in payload_type: lexer = "python"
        elif "php" in payload_type: lexer = "php"
        
        from rich.syntax import Syntax
        console.print(Syntax(raw_payload, lexer, theme="monokai", line_numbers=False, word_wrap=True))
        console.print()
        
        return {
            "type": payload_type,
            "lhost": lhost,
            "lport": lport,
            "payload": raw_payload
        }
    else:
        error(f"Unknown payload type: {payload_type}")
        info("Use 'perc --payload list' to see available options.")
        return None
