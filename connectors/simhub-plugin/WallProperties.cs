// Les propriétés SimHub du mur (EnduranceManagerPlugin.Mur.*), lues par le dash « Endurance Manager · Mur » (Dashes.cs).
// Une ligne par case de la maquette validée ; chaque valeur vient de WallView (Wall.cs).
using System;
using System.Collections.Generic;

namespace EnduranceManager.SimHub
{
    public static class WallProperties
    {
        static readonly string[] Corners = { "AVG", "AVD", "ARG", "ARD" };

        public static readonly (string Name, Func<WallView, object> Get)[] All = Build();

        static (string, Func<WallView, object>)[] Build()
        {
            var list = new List<(string, Func<WallView, object>)>
            {
                ("Mur.EnDirect", v => v.Live), ("Mur.Etat", v => v.Status),
                ("Mur.Piste", v => v.Track), ("Mur.Seance", v => v.Session), ("Mur.TempsRestant", v => v.TimeLeft), ("Mur.ToursRestants", v => v.LapsLeft),
                ("Mur.Meteo", v => v.Weather), ("Mur.TempPiste", v => v.TrackTemp), ("Mur.TempAir", v => v.AirTemp),
                ("Mur.Pilote", v => v.Driver), ("Mur.Voiture", v => v.Car), ("Mur.Categorie", v => v.Class), ("Mur.CategorieCouleur", v => v.ClassColor), ("Mur.Place", v => v.Place),
                ("Mur.Piste.Ligne", v => v.LineAt), ("Mur.Piste.FinS1", v => v.Sector1At), ("Mur.Piste.FinS2", v => v.Sector2At),
                ("Mur.Energie.Titre", v => v.EnergyLabel), ("Mur.Energie.Valeur", v => v.Energy), ("Mur.Energie.Remplissage", v => v.EnergyFill),
                ("Mur.Energie.DernierTour", v => v.EnergyLast), ("Mur.Energie.Moy5", v => v.EnergyAvg5), ("Mur.Energie.Relais", v => v.EnergyStint),
                ("Mur.Energie.ToursRestants", v => v.EnergyLapsLeft), ("Mur.Energie.Alerte", v => v.EnergyAlert),
                ("Mur.Carburant.Valeur", v => v.Fuel), ("Mur.Carburant.DernierTour", v => v.FuelLast), ("Mur.Carburant.Moy5", v => v.FuelAvg5),
                ("Mur.Carburant.ToursRestants", v => v.FuelLapsLeft), ("Mur.Ratio", v => v.Ratio),
                ("Mur.Chrono.Dernier", v => v.LastLap), ("Mur.Chrono.Meilleur", v => v.BestLap), ("Mur.Chrono.Moy5", v => v.Avg5),
                ("Mur.Chrono.Delta", v => v.Delta), ("Mur.Chrono.DeltaCouleur", v => v.DeltaColor), ("Mur.Chrono.Optimal", v => v.Optimal),
                ("Mur.Chrono.Prevu", v => v.Predicted), ("Mur.Relais.Tours", v => v.StintLaps), ("Mur.Arrets", v => v.Stops),
                ("Mur.Reglages.TC", v => v.TC), ("Mur.Reglages.Coupure", v => v.TCCut), ("Mur.Reglages.Glisse", v => v.TCSlip), ("Mur.Reglages.ABS", v => v.ABS),
                ("Mur.Reglages.Carto", v => v.Map), ("Mur.Reglages.Migration", v => v.Migration), ("Mur.Reglages.Repartition", v => v.Bias),
                ("Mur.Reglages.Batterie", v => v.Battery), ("Mur.Reglages.Regen", v => v.Regen), ("Mur.Gomme", v => v.Compound),
                ("Mur.Entrees.Accelerateur", v => v.Throttle), ("Mur.Entrees.Frein", v => v.Brake), ("Mur.Entrees.Volant", v => v.Steer),
                ("Mur.Entrees.Rapport", v => v.Gear), ("Mur.Entrees.Vitesse", v => v.Speed),
                ("Mur.Degats.Alerte", v => v.DamageAlert), ("Mur.PlaceCourte", v => v.PlaceShort), ("Mur.PlaceNumero", v => v.PlaceNumber),
                ("Mur.PneusBandeau", v => v.TyreBand), ("Mur.RelaisTexte", v => v.StintText), ("Mur.Conditions", v => v.Conditions),
                ("Mur.Entrees.GazTexte", v => v.ThrottleText), ("Mur.Entrees.FreinTexte", v => v.BrakeText), ("Mur.Degats.Aileron", v => v.WingOff),
            };
            for (int k = 0; k < 3; k++)
            {
                int s = k;
                list.Add(("Mur.Chrono.S" + (s + 1), v => v.LastSectors[s]));
                list.Add(("Mur.Chrono.MeilleurS" + (s + 1), v => v.BestSectors[s]));
            }
            for (int k = 0; k < 8; k++) { int z = k; list.Add(("Mur.Degats.Zone" + z, v => v.Dents[z])); }
            for (int k = 0; k < 4; k++)
            {
                int w = k;
                string at = "Mur.Pneus." + Corners[w] + ".";
                list.Add((at + "Restant", v => v.Tyres[w].Left)); list.Add((at + "RestantValeur", v => v.Tyres[w].LeftValue));
                list.Add((at + "Bande", v => v.Tyres[w].Tread)); list.Add((at + "Interieur", v => v.Tyres[w].In)); list.Add((at + "Milieu", v => v.Tyres[w].Mid)); list.Add((at + "Exterieur", v => v.Tyres[w].Out));
                list.Add((at + "Carcasse", v => v.Tyres[w].Carcass)); list.Add((at + "Frein", v => v.Tyres[w].Brake)); list.Add((at + "Pression", v => v.Tyres[w].Pressure));
                list.Add((at + "UsureMoy5", v => v.Tyres[w].Wear5)); list.Add((at + "Gomme", v => v.Tyres[w].Compound));
                list.Add((at + "Use", v => v.Tyres[w].Worn)); list.Add((at + "TresUse", v => v.Tyres[w].VeryWorn)); list.Add((at + "Crevaison", v => v.Tyres[w].Flat));
            }
            for (int k = 0; k < WallView.Rows; k++)
            {
                int r = k;
                string at = "Mur.Classement." + (r + 1) + ".";
                list.Add((at + "Visible", v => v.Standing[r].Visible)); list.Add((at + "Nous", v => v.Standing[r].Us));
                list.Add((at + "Pos", v => v.Standing[r].Pos)); list.Add((at + "Num", v => v.Standing[r].Num)); list.Add((at + "Pilote", v => v.Standing[r].Name));
                list.Add((at + "Voiture", v => v.Standing[r].Car)); list.Add((at + "Devant", v => v.Standing[r].Ahead)); list.Add((at + "Leader", v => v.Standing[r].Leader));
                list.Add((at + "Dernier", v => v.Standing[r].Last)); list.Add((at + "Meilleur", v => v.Standing[r].BestLap)); list.Add((at + "MeilleurCategorie", v => v.Standing[r].Best));
                list.Add((at + "Relais", v => v.Standing[r].Stint)); list.Add((at + "Pneus", v => v.Standing[r].Tyres));
                list.Add((at + "Stands", v => v.Standing[r].Pit)); list.Add((at + "StandsCouleur", v => v.Standing[r].PitColor));
            }
            for (int k = 0; k < 6; k++)
            {
                int r = k;
                string at = "Mur.Relatif." + (r + 1) + ".";
                list.Add((at + "Visible", v => v.Relative[r].Visible)); list.Add((at + "Pos", v => v.Relative[r].Pos)); list.Add((at + "Num", v => v.Relative[r].Num));
                list.Add((at + "Pilote", v => v.Relative[r].Name)); list.Add((at + "Ecart", v => v.Relative[r].Gap)); list.Add((at + "Couleur", v => v.Relative[r].ClassColor));
                list.Add((at + "TourDeRetard", v => v.Relative[r].Down)); list.Add((at + "TourDAvance", v => v.Relative[r].Up)); list.Add((at + "Stands", v => v.Relative[r].Pit));
            }
            for (int k = 0; k < WallView.Dots; k++)
            {
                int d = k;
                string at = "Mur.Piste." + (d + 1) + ".";
                list.Add((at + "Visible", v => v.Track2[d].Visible)); list.Add((at + "X", v => v.Track2[d].X)); list.Add((at + "Pos", v => v.Track2[d].Pos));
                list.Add((at + "Couleur", v => v.Track2[d].Color)); list.Add((at + "Nous", v => v.Track2[d].Us)); list.Add((at + "Stand", v => v.Track2[d].Pit));
            }
            return list.ToArray();
        }
    }
}
