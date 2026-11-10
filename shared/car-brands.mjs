// Car brand of a catalogue car name, for the small logo before the car.
// Colour logos in /images/brands/<id>.webp (brand trademarks, used only to name the car). No logo: initials.
const BRANDS = [
  ['Acura','acura'],['Adess'],['Alpine','alpine'],['Aston Martin','astonmartin'],['Audi','audi'],['BMW','bmw'],
  ['Cadillac','cadillac'],['Chevrolet','chevrolet'],['Corvette','corvette','Chevrolet Corvette'],['Dallara','dallara'],['Duqueine','duqueine'],
  ['Ferrari','ferrari'],['Ford','ford'],['Genesis','genesis'],['Ginetta','ginetta'],['Glickenhaus','glickenhaus'],['Global Mazda','mazda','Mazda'],
  ['Honda','honda'],['HPD','honda','Honda'],['Hyundai','hyundai'],['Isotta Fraschini'],
  ['Lamborghini','lamborghini'],['Lexus','lexus'],['Ligier','ligier'],['McLaren','mclaren'],['Mercedes','mercedes','Mercedes-AMG'],
  ['Nissan','nissan'],['Oreca','oreca'],['Peugeot','peugeot'],['Porsche','porsche'],['Renault','renault'],
  ['Supercars Chevrolet','chevrolet','Chevrolet'],['Supercars Ford','ford','Ford'],['Toyota','toyota'],['Vanwall','vanwall']
].sort((a,b) => b[0].length - a[0].length);

const initials = name => { const words = name.split(/\s+/).filter(Boolean); return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0,2)).toUpperCase(); };

export function carBrand(car) {
  const text = String(car || '').trim().toLowerCase();
  if(!text) return null;
  const found = BRANDS.find(([prefix]) => text === prefix.toLowerCase() || text.startsWith(prefix.toLowerCase() + ' ') || text.startsWith(prefix.toLowerCase() + '-'));
  if(!found) return null;
  const [prefix, logo = null, name = prefix] = found;
  return {name, logo, initials: initials(name)};
}

// Short car names for display (validated by Nathan 2026-11-10): brand dropped when the logo and the model
// speak for themselves, kept before a bare number or code. Registrations keep the full name.
const SHORT_NAMES = {
  "Alpine A424": "Alpine A424",
  "Aston Martin Valkyrie AMR LMH": "Valkyrie",
  "BMW M Hybrid V8": "M Hybrid V8",
  "Cadillac V-Series.R": "V-Series.R",
  "Ferrari 499P": "Ferrari 499P",
  "Genesis GMR-001 LMDh": "Genesis GMR-001",
  "Glickenhaus SCG 007": "Glickenhaus 007",
  "Isotta Fraschini Tipo 6-C": "Isotta Tipo 6",
  "Lamborghini SC63": "Lamborghini SC63",
  "Peugeot 9X8": "Peugeot 9X8",
  "Peugeot 9X8 Evo": "Peugeot 9X8 Evo",
  "Porsche 963": "Porsche 963",
  "Toyota GR010 Hybrid": "Toyota GR010",
  "Vanwall Vandervell 680": "Vanwall 680",
  "Oreca 07 Gibson ELMS": "Oreca 07 ELMS",
  "Oreca 07 Gibson": "Oreca 07",
  "Ligier JS P325": "JS P325",
  "Ginetta G61-LT-P3": "Ginetta G61",
  "Duqueine D09": "Duqueine D09",
  "Adess AD25": "Adess AD25",
  "Aston Martin Vantage AMR LMGT3": "Vantage GT3",
  "BMW M4 LMGT3": "BMW M4",
  "Chevrolet Corvette Z06 LMGT3.R": "Corvette Z06",
  "Ferrari 296 LMGT3": "Ferrari 296",
  "Ford Mustang LMGT3": "Mustang",
  "Lamborghini Huracán LMGT3": "Huracán",
  "Lexus RC F LMGT3": "Lexus RC F",
  "Mercedes-AMG LMGT3": "AMG GT3",
  "McLaren 720S LMGT3": "McLaren 720S",
  "Porsche 911 GT3 R LMGT3": "911 GT3 R",
  "Aston Martin Vantage GTE": "Vantage GTE",
  "Chevrolet Corvette C8.R": "Corvette C8.R",
  "Ferrari 488 GTE": "Ferrari 488",
  "Porsche 911 RSR-19": "911 RSR",
  "Acura ARX-06 GTP": "Acura ARX-06",
  "Aston Martin Valkyrie AMR-LMH": "Valkyrie",
  "BMW M Hybrid V8 (EVO)": "M Hybrid V8",
  "Cadillac V-Series.R GTP": "V-Series.R",
  "Porsche 963 GTP": "Porsche 963",
  "Dallara P217 LMP2": "Dallara P217",
  "Ligier JS P320": "JS P320",
  "Acura NSX GT3 EVO 22": "Acura NSX",
  "Aston Martin Vantage GT3 EVO": "Vantage GT3",
  "Audi R8 LMS EVO II GT3": "Audi R8",
  "BMW M4 GT3 EVO": "BMW M4 GT3",
  "Chevrolet Corvette Z06 GT3.R": "Corvette Z06",
  "Ferrari 296 GT3": "Ferrari 296",
  "Ford Mustang GT3": "Mustang GT3",
  "Lamborghini Huracán GT3 EVO": "Huracán",
  "McLaren 720S GT3 EVO": "McLaren 720S",
  "Mercedes-AMG GT3 2020": "AMG GT3",
  "Porsche 911 GT3 R (992)": "911 GT3 R",
  "Porsche 911 Cup (992.2)": "911 Cup",
  "Aston Martin Vantage GT4": "Vantage GT4",
  "BMW M4 G82 GT4": "BMW M4 GT4",
  "Ford Mustang GT4": "Mustang GT4",
  "McLaren 570S GT4": "McLaren 570S",
  "Mercedes-AMG GT4": "AMG GT4",
  "Porsche 718 Cayman GT4 Clubsport MR": "Cayman",
  "Audi RS 3 LMS TCR": "Audi RS 3",
  "Audi RS3 LMS Gen2 TCR": "Audi RS 3 Gen2",
  "Honda Civic Type R TCR": "Civic",
  "Hyundai Elantra N TCR": "Elantra N",
  "Hyundai Veloster N TCR": "Veloster N",
  "BMW M2 CS Racing": "BMW M2 CS",
  "BMW M2 Racing (G87)": "BMW M2 G87",
  "HPD ARX-01c": "HPD ARX-01c",
  "Aston Martin DBR9 GT1": "Aston DBR9",
  "Chevrolet Corvette C6.R GT1": "Corvette C6.R",
  "Ford GT GT2": "Ford GT",
  "Nissan GTP ZX-T": "Nissan ZX-T",
  "Audi 90 GTO": "Audi 90 GTO",
  "Global Mazda MX-5 Cup": "MX-5",
  "Renault Clio R.S. V": "Clio",
  "Toyota GR86": "Toyota GR86",
  "Supercars Chevrolet Camaro Gen 3": "Camaro",
  "Supercars Ford Mustang Gen 3": "Mustang Supercars"
};
export const carShortName = car => SHORT_NAMES[String(car || '').trim()] || String(car || '');
