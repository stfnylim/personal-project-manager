' Runs the PM brain with no console window; output lands in pm-brain\last-run.log
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""O:\CGI\R_n_D\work.steph\src\project-manager\pm-brain\run-brain.ps1""", 0, False
