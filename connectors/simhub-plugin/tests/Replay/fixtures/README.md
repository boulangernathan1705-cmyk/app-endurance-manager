# Séances de test

Séances réelles reprises des fiches combo (base du site de dev), sans nom ni identifiant : par tour, ce que le
plugin a envoyé (temps, secteurs, carburant, énergie, usure, températures, pressions, arrêts) et la trace du meilleur
tour, un point par seconde (temps, distance, x, z, km/h, accélérateur, frein, rapport).

`Synth.cs` en refait la mémoire de LMU dix fois par seconde ; les tests la rejouent dans le code du plugin et
vérifient qu'il retrouve les mêmes tours, arrêts et chiffres.

Colonnes de `laps` : n, t, s1, s2, s3, fuel, ve, usure AVG, AVD, ARG, ARD, temp, kPa, frein, gomme, piste °C, air °C,
pluie, humidité, vitesse max, invalide, stands, lumière. `stops` : tour, voie (s), arrêté (s), carburant, énergie,
pneus, réparation.
