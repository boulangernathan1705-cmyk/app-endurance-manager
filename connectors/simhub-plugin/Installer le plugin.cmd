@echo off
rem Installe ou met à jour le plugin Fiches combo dans SimHub : double-clic, rien d'autre. Télécharge la dernière DLL
rem sur le site qui a donné ce fichier (ou prend celle posée à côté), ferme SimHub, la copie dans le dossier de SimHub,
rem la débloque et relance SimHub. La partie PowerShell est en bas du fichier.
set "EM_SELF=%~f0"
set "EM_MODE=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath $env:EM_SELF -Raw -Encoding UTF8) -split '#\s*POWERSHELL\s*#')[1]"
exit /b

# POWERSHELL #
[Console]::OutputEncoding = [Text.Encoding]::UTF8
# The site this file came from: written in by the fiches combo page or by the plugin when they hand it out.
$site = '@@SITE@@'
$dll = Join-Path (Split-Path $env:EM_SELF) 'EnduranceManager.SimHub.dll'
$simhub = (Get-ItemProperty 'HKCU:\Software\SimHub' -ErrorAction SilentlyContinue).InstallDirectory
if (-not $simhub) { $simhub = 'C:\Program Files (x86)\SimHub' }
$copyOnly = $env:EM_MODE -eq 'copie'
# Started by the plugin's « Mettre à jour » button: the window closes by itself when all went well.
$update = $env:EM_MODE -eq 'maj'

function Done($text) {
    Write-Host ''; Write-Host $text
    # Started by the plugin, SimHub has already closed: it comes back even when the update could not be done.
    $exe = Join-Path $simhub 'SimHubWPF.exe'
    if ($update -and (Test-Path $exe) -and -not (Get-Process SimHubWPF -ErrorAction SilentlyContinue)) { Start-Process $exe -WorkingDirectory $simhub }
    if (-not $copyOnly) { Read-Host 'Appuie sur Entrée pour fermer' | Out-Null }
}

# The latest build from the site, checked against the size and fingerprint the site gives, next to this file.
if (-not $copyOnly -and $site -match '^https://') {
    Write-Host "Téléchargement du plugin depuis $site..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $info = Invoke-RestMethod "$site/downloads/simhub/plugin.json" -UseBasicParsing
        $part = "$dll.part"
        Invoke-WebRequest "$site/downloads/simhub/EnduranceManager.SimHub.dll" -OutFile $part -UseBasicParsing
        if ((Get-Item $part).Length -ne $info.size -or (Get-FileHash $part -Algorithm SHA256).Hash -ne $info.sha256.ToUpper()) { Remove-Item $part; throw 'fichier abîmé' }
        Move-Item $part $dll -Force
        Write-Host "Version $($info.version) téléchargée."
    }
    catch { Done "Le téléchargement n'a pas marché ($($_.Exception.Message)). Vérifie ta connexion et relance cet installeur. SimHub n'a pas été modifié."; return }
}

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
    # Asked politely first (the plugin's button already closes SimHub itself); SimHub can stay in the tray or wait on a
    # question, so after 15 s it is stopped: its settings are saved as it goes.
    Write-Host 'Fermeture de SimHub...'
    $running | ForEach-Object { $null = $_.CloseMainWindow() }
    $running | ForEach-Object { $null = $_.WaitForExit(15000) }
    if (Get-Process SimHubWPF -ErrorAction SilentlyContinue) {
        Write-Host 'SimHub ne se ferme pas tout seul : arrêt forcé.'
        Get-Process SimHubWPF -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep 2
    }
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
if ($update) { Write-Host "C'est fait, ta liaison est gardée."; Start-Sleep 3; return }
# A first install: the fiches combo page of the same site opens, for the code.
if ($site -match '^https://') { Start-Process "$site/fiches-combo.html" }
Done "C'est fait. Dans SimHub, accepte le nouveau plugin « Fiches combo » s'il te le demande. Ensuite, sur le site : Fiches combo → « Relier SimHub » → « Créer mon code », et ouvre le menu « Fiches combo » de SimHub : il trouve le code tout seul."
