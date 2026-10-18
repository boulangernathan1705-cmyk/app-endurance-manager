@echo off
rem Installe le plugin Fiches combo dans SimHub : double-clic, rien d'autre. Ferme SimHub, copie la DLL posée à côté
rem de ce fichier dans le dossier de SimHub, la débloque et relance SimHub. La partie PowerShell est en bas du fichier.
set "EM_SELF=%~f0"
set "EM_MODE=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath $env:EM_SELF -Raw -Encoding UTF8) -split '#\s*POWERSHELL\s*#')[1]"
exit /b

# POWERSHELL #
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$dll = Join-Path (Split-Path $env:EM_SELF) 'EnduranceManager.SimHub.dll'
$simhub = (Get-ItemProperty 'HKCU:\Software\SimHub' -ErrorAction SilentlyContinue).InstallDirectory
if (-not $simhub) { $simhub = 'C:\Program Files (x86)\SimHub' }
$copyOnly = $env:EM_MODE -eq 'copie'

function Done($text) { Write-Host ''; Write-Host $text; if (-not $copyOnly) { Read-Host 'Appuie sur Entrée pour fermer' | Out-Null } }

if (-not (Test-Path $dll)) { Done "Le fichier EnduranceManager.SimHub.dll doit être dans le même dossier que cet installeur."; return }
if (-not (Test-Path (Join-Path $simhub 'SimHubWPF.exe'))) { Done "SimHub est introuvable ($simhub). Installe SimHub, lance-le une fois, puis relance cet installeur."; return }

# The copy alone, run again as administrator when the SimHub folder needs it.
function Copy-Plugin {
    Copy-Item $dll $simhub -Force -ErrorAction Stop
    Unblock-File (Join-Path $simhub 'EnduranceManager.SimHub.dll')
}
if ($copyOnly) { Copy-Plugin; return }

Write-Host 'Installation du plugin Fiches combo dans SimHub'
$running = Get-Process SimHubWPF -ErrorAction SilentlyContinue
if ($running) {
    Write-Host 'Fermeture de SimHub...'
    $running | ForEach-Object { $null = $_.CloseMainWindow() }
    $running | ForEach-Object { $null = $_.WaitForExit(20000) }
    while (Get-Process SimHubWPF -ErrorAction SilentlyContinue) { Read-Host 'SimHub est encore ouvert : ferme-le, puis appuie sur Entrée' | Out-Null }
}

try { Copy-Plugin }
catch {
    Write-Host 'Le dossier de SimHub demande les droits administrateur : accepte la fenêtre de Windows.'
    try { Start-Process $env:EM_SELF -ArgumentList 'copie' -Verb RunAs -Wait -WindowStyle Hidden } catch { }
}
$installed = Get-Item (Join-Path $simhub 'EnduranceManager.SimHub.dll') -ErrorAction SilentlyContinue
if (-not $installed -or $installed.Length -ne (Get-Item $dll).Length) { Done "La copie n'a pas pu se faire. SimHub n'a pas été modifié."; return }

Write-Host 'Plugin copié, SimHub redémarre.'
Start-Process (Join-Path $simhub 'SimHubWPF.exe') -WorkingDirectory $simhub
Done "C'est fait. Dans SimHub, accepte le nouveau plugin « Fiches combo » s'il te le demande. Ensuite, sur le site : Fiches combo → « Relier SimHub » → « Copier le code », et ouvre le menu « Fiches combo » de SimHub : il trouve le code tout seul."
