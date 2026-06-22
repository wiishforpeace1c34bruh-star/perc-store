"""
modules/payload/obfuscate.py — Payload obfuscation engine
"""

import base64
import random
import string
import re
from core.display import console, section_header, dim

# Common variables and function names that could be obfuscated
KEYWORDS = [
    "invoke", "execute", "download", "webclient", "stream",
    "buffer", "socket", "connect", "payload", "shell",
    "system", "process", "thread", "memory", "virtual"
]

def base64_encode(payload: str) -> str:
    """Standard base64 encoding."""
    return base64.b64encode(payload.encode()).decode()

def hex_encode(payload: str) -> str:
    """Hex encoding."""
    return payload.encode().hex()

def powershell_base64(payload: str) -> str:
    """PowerShell-specific UTF-16LE base64 encoding."""
    encoded = base64.b64encode(payload.encode('utf-16le')).decode()
    return f"powershell -ExecutionPolicy Bypass -NoProfile -EncodedCommand {encoded}"

def variable_substitution(payload: str) -> str:
    """Replace common keywords with random variable names."""
    obfuscated = payload
    substitutions = {}
    
    for kw in KEYWORDS:
        # Check if keyword exists (case insensitive)
        if re.search(r'\b' + kw + r'\b', obfuscated, re.IGNORECASE):
            # Generate random 6-8 char string
            rand_name = ''.join(random.choices(string.ascii_letters, k=random.randint(6, 8)))
            substitutions[kw] = rand_name
            # Replace all occurrences
            obfuscated = re.sub(r'\b' + kw + r'\b', rand_name, obfuscated, flags=re.IGNORECASE)
            
    return obfuscated

def string_split(payload: str, chunk_size: int = 3) -> str:
    """Split strings into concatenated chunks. Basic implementation for testing."""
    # This is a naive implementation that just splits the whole payload into chunks
    # A real implementation would parse the AST and only split literal strings
    chunks = [payload[i:i+chunk_size] for i in range(0, len(payload), chunk_size)]
    return " + ".join([f"'{c}'" for c in chunks])

def xor_encode(payload: str, key: int = None) -> tuple[str, int]:
    """XOR encode with a random or specified key."""
    if key is None:
        key = random.randint(1, 255)
    
    encoded = bytearray()
    for char in payload.encode():
        encoded.append(char ^ key)
        
    return base64.b64encode(encoded).decode(), key

def list_obfuscation_methods() -> list[dict]:
    """Return all available obfuscation methods."""
    return [
        {"id": "base64", "description": "Standard Base64 encoding"},
        {"id": "hex", "description": "Hexadecimal encoding"},
        {"id": "powershell_b64", "description": "PowerShell EncodedCommand"},
        {"id": "vars", "description": "Variable substitution (keyword replacement)"},
        {"id": "split", "description": "String chunking/splitting"},
        {"id": "xor", "description": "XOR encoding (returns base64 wrapped)"}
    ]

def obfuscate(payload: str, methods: list[str]) -> dict:
    """Apply one or more obfuscation methods in sequence."""
    result = payload
    applied = []
    
    for method in methods:
        try:
            if method == "base64":
                result = base64_encode(result)
            elif method == "hex":
                result = hex_encode(result)
            elif method == "powershell_b64":
                result = powershell_base64(result)
            elif method == "vars":
                result = variable_substitution(result)
            elif method == "split":
                result = string_split(result)
            elif method == "xor":
                result, key = xor_encode(result)
                applied.append(f"xor (key: {key})")
                continue # Skip standard append
            else:
                continue
            
            applied.append(method)
        except Exception as e:
            dim(f"Error applying obfuscation method '{method}': {e}")
            
    return {
        "original": payload,
        "obfuscated": result,
        "methods_applied": applied
    }
