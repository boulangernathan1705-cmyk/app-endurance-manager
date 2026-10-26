# Convertir un dash NeoRed : remplace les propriétés du plugin NeoRed (LMU_NeoRedPlugin.…) par celles du plugin
# Endurance Manager qui portent le même nom (EnduranceManagerPlugin.…), dans les fichiers d'un dash de SimHub.
# Clic droit › Exécuter avec PowerShell, puis glisser le dossier du dash (SimHub\DashTemplates\<nom du dash>) dans la fenêtre.
# Chaque fichier modifié est d'abord copié à côté, en .neored.bak. Les propriétés que notre plugin ne fournit pas encore
# restent sur NeoRed et sont listées à la fin.
$dossier = if ($args.Count -gt 0) { $args[0] } else { (Read-Host "Dossier du dash (glisse-le ici puis Entrée)").Trim('"', ' ') }
if (-not (Test-Path $dossier -PathType Container)) { Read-Host "Dossier introuvable : $dossier. Entrée pour fermer"; exit 1 }

# Les noms publiés par Course.cs (Course.Properties), les mêmes que NeoRed.
$noms = @(
    "Energy.Batt.Current_%",
    "Energy.ComputedFuelRatio_LastLap",
    "Energy.Fuel.Computed_RemainLaps",
    "Energy.Fuel.Current_L",
    "Energy.Fuel.LiterPerLap_Average",
    "Energy.Fuel.Max_L",
    "Energy.Fuel.NeededUntilEnd_L",
    "Energy.Fuel.PerLastLap_L",
    "Energy.Fuel.toRefill_L",
    "Energy.Fuel.toRefill_safe_L",
    "Energy.Regen_kW",
    "Energy.VE.Computed_RemainLaps",
    "Energy.VE.Current_%",
    "Energy.VE.FractionPerLap_%",
    "Energy.VE.NeededUntilEnd_%",
    "Energy.VE.PerLastLap_%",
    "Energy.VE.toRefill_%",
    "Energy.VE.toRefill_safe_%",
    "Extended.ABS_Text",
    "Extended.Migration_Text",
    "Extended.MotorMap_Text",
    "Extended.TC_Text",
    "Extended.VM_ANTILOCKBRAKESYSTEMMAP",
    "Extended.VM_BRAKE_BALANCE",
    "Extended.VM_BRAKE_MIGRATION",
    "Extended.VM_ELECTRIC_MOTOR_MAP",
    "Extended.VM_FRONT_ANTISWAY",
    "Extended.VM_REAR_ANTISWAY",
    "Extended.VM_TRACTIONCONTROLMAP",
    "Extended.VM_TRACTIONCONTROLPOWERCUTMAP",
    "Extended.VM_TRACTIONCONTROLSLIPANGLEMAP",
    "GameInfos.BestLapTime",
    "GameInfos.CarsInClass",
    "GameInfos.Computed_RemainLaps",
    "GameInfos.DeltaBest",
    "GameInfos.GapCarAhead",
    "GameInfos.GapCarBehind",
    "GameInfos.GapToAheadInClassTime",
    "GameInfos.GapToFirstInClassLaps",
    "GameInfos.GapToFirstInClassTime",
    "GameInfos.InGarage",
    "GameInfos.InPits",
    "GameInfos.LastLapTime",
    "GameInfos.PitState",
    "GameInfos.PosInClass",
    "GameInfos.PosOverall",
    "GameInfos.TimeLeft_s",
    "GameInfos.TimeOfDay",
    "Pit.StopLength",
    "Pit.Stops",
    "PitMenu.All_Text",
    "PitMenu.BrakesReplace_Text",
    "PitMenu.Driver_Text",
    "PitMenu.FuelRatio",
    "PitMenu.Fuel_Text",
    "PitMenu.Grille",
    "PitMenu.RepairDamage_Text",
    "PitMenu.Tyre.FL_TyreChange_Name",
    "PitMenu.Tyre.FL_Tyre_NewPressure_kPa_Text",
    "PitMenu.Tyre.FR_TyreChange_Name",
    "PitMenu.Tyre.FR_Tyre_NewPressure_kPa_Text",
    "PitMenu.Tyre.RL_TyreChange_Name",
    "PitMenu.Tyre.RL_Tyre_NewPressure_kPa_Text",
    "PitMenu.Tyre.RR_TyreChange_Name",
    "PitMenu.Tyre.RR_Tyre_NewPressure_kPa_Text",
    "PitMenu.Virtual_Energy_Text",
    "PitMenu.Wing",
    "PitStopEstimate.Brakes",
    "PitStopEstimate.Damage",
    "PitStopEstimate.DriverSwap",
    "PitStopEstimate.Fuel",
    "PitStopEstimate.Tires",
    "PitStopEstimate.Total",
    "PitStopEstimate.VE",
    "Race.Player.Penalties",
    "Race.Player.TrackLimitsPoints",
    "TeamInfos.Driver",
    "TrackInfos.Name",
    "Tyre.FL_TyreCompound_Name",
    "Tyre.FL_TyreLeft_%",
    "Tyre.FL_TyrePressure_kPa",
    "Tyre.FL_TyreTemp_C",
    "Tyre.FR_TyreCompound_Name",
    "Tyre.FR_TyreLeft_%",
    "Tyre.FR_TyrePressure_kPa",
    "Tyre.FR_TyreTemp_C",
    "Tyre.RL_TyreCompound_Name",
    "Tyre.RL_TyreLeft_%",
    "Tyre.RL_TyrePressure_kPa",
    "Tyre.RL_TyreTemp_C",
    "Tyre.RR_TyreCompound_Name",
    "Tyre.RR_TyreLeft_%",
    "Tyre.RR_TyrePressure_kPa",
    "Tyre.RR_TyreTemp_C",
    "VehicleCondition.Damage_%",
    "VehicleCondition.FL_BrakeTemp_C",
    "VehicleCondition.FR_BrakeTemp_C",
    "VehicleCondition.OilTemp",
    "VehicleCondition.RL_BrakeTemp_C",
    "VehicleCondition.RR_BrakeTemp_C",
    "VehicleCondition.WaterTemp",
    "VehicleInfos.Class",
    "VehicleInfos.Name",
    "WeatherInfos.Current.AmbientTemp",
    "WeatherInfos.Current.CloudCoverage_%",
    "WeatherInfos.Current.RainIntensity_%",
    "WeatherInfos.Track.Temp",
    "WeatherInfos.Track.Wetness_%"
)

$fichiers = Get-ChildItem -Path $dossier -Recurse -File -Include *.djson, *.json, *.js |
    Where-Object { $_.FullName -notlike '*\_Backups\*' -and $_.FullName -notlike '*\_SHFonts\*' }
$restants = @{}
foreach ($fichier in $fichiers) {
    $texte = [System.IO.File]::ReadAllText($fichier.FullName)
    if ($texte -notmatch 'NeoRedPlugin\.') { continue }
    $nouveau = $texte
    foreach ($nom in $noms) {
        $motif = '(?:LMU_)?NeoRedPlugin\.' + [regex]::Escape($nom) + '(?![A-Za-z0-9_%.])'
        $nouveau = [regex]::Replace($nouveau, $motif, 'EnduranceManagerPlugin.' + $nom)
    }
    foreach ($m in [regex]::Matches($nouveau, '(?:LMU_)?NeoRedPlugin\.[A-Za-z0-9_%.]+')) { $restants[$m.Value] = $true }
    if ($nouveau -ne $texte) {
        Copy-Item $fichier.FullName ($fichier.FullName + '.neored.bak') -Force
        [System.IO.File]::WriteAllText($fichier.FullName, $nouveau)
        Write-Host "Converti : $($fichier.Name)"
    }
}
if ($restants.Count -gt 0) {
    Write-Host ""
    Write-Host "Encore lus sur NeoRed (pas encore dans notre plugin) :"
    $restants.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }
}
Write-Host ""
Read-Host "Terminé. Entrée pour fermer"
