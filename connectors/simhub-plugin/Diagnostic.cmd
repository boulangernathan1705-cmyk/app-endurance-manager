@echo off
rem Diagnostic du plugin Fiches combo : lit seulement, ne change rien. Écrit un rapport sur le Bureau à envoyer.
set "EM_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath $env:EM_SELF -Raw -Encoding UTF8) -split '#\s*POWERSHELL\s*#')[1]"
exit /b

# POWERSHELL #
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$lines = New-Object System.Collections.Generic.List[string]
function Say($text) { $lines.Add($text); Write-Host $text }
Say "Diagnostic Fiches combo · $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"

$simhub = (Get-ItemProperty 'HKCU:\Software\SimHub' -ErrorAction SilentlyContinue).InstallDirectory
if (-not $simhub) { $simhub = 'C:\Program Files (x86)\SimHub' }
Say "Dossier SimHub : $simhub (existe : $(Test-Path $simhub))"
$dll = Get-Item (Join-Path $simhub 'EnduranceManager.SimHub.dll') -ErrorAction SilentlyContinue
Say $(if ($dll) { "Plugin installé : $($dll.Length) octets, $($dll.LastWriteTime)" } else { 'Plugin installé : NON (EnduranceManager.SimHub.dll absent du dossier SimHub)' })
foreach ($name in 'SimHubWPF', 'Le Mans Ultimate') {
    $p = Get-Process $name -ErrorAction SilentlyContinue | Select-Object -First 1
    Say "$name : $(if ($p) { "ouvert depuis $($p.StartTime)" } else { 'fermé' })"
}
try { $m = [IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('LMU_Data'); $m.Dispose(); Say 'Mémoire partagée LMU_Data : présente' }
catch { Say 'Mémoire partagée LMU_Data : absente (normal si le jeu est fermé)' }

$settings = Join-Path $simhub 'PluginsData\Common\EnduranceManagerPlugin.GeneralSettings.json'
if (Test-Path $settings) {
    $json = Get-Content $settings -Raw | ConvertFrom-Json
    $code = [string]$json.Code
    $kind = if ($code -match '^(EM\w+) (https://\S+) [a-f0-9]{64} \1$') { "$($Matches[1]) vers $($Matches[2])" } elseif ($code) { 'code illisible' } else { 'aucun code' }
    Say "Réglages du plugin : $kind · activé : $($json.Enabled) · modifiés le $((Get-Item $settings).LastWriteTime)"
} else { Say 'Réglages du plugin : aucun (le plugin ne s''est jamais lancé dans SimHub, ou aucun code collé)' }

$folder = Join-Path $env:LOCALAPPDATA 'EnduranceManager\Combos'
Say "Dossier des séances : $folder (existe : $(Test-Path $folder))"
Get-ChildItem (Join-Path $folder 'sessions') -Filter *.json -ErrorAction SilentlyContinue | ForEach-Object { Say "  En attente : $($_.Name) · $($_.Length) octets · $($_.LastWriteTime)" }
Get-ChildItem (Join-Path $folder 'sessions\refused') -Filter *.json -ErrorAction SilentlyContinue | ForEach-Object {
    $why = Get-Content "$($_.FullName).txt" -Raw -ErrorAction SilentlyContinue
    Say "  Refusée : $($_.Name) · $($_.LastWriteTime) · raison : $why"
}

$log = Join-Path $simhub 'Logs\SimHub.txt'
if (Test-Path $log) {
    $start = Select-String -Path $log -Pattern 'Starting SimHub' | Select-Object -Last 1
    Say "Dernier démarrage de SimHub : $($start.Line)"
    Get-Content $log | Select-Object -Skip ([Math]::Max(0, $start.LineNumber - 1)) | Select-String '^\[.*EnduranceManager' | Select-Object -First 15 |
        ForEach-Object { Say "  $($_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)))" }
}

$report = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Diagnostic Fiches combo.txt'
$lines | Set-Content -Path $report -Encoding UTF8
Write-Host ''
Write-Host "Rapport enregistré sur le Bureau : $report"
Write-Host 'Envoie ce fichier à ton équipe. Il ne contient pas ta clé de liaison.'
Read-Host 'Appuie sur Entrée pour fermer' | Out-Null
