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
