// Car brand of a catalogue car name, for the small logo before the car.
// Logos: Simple Icons (CC0), one-colour SVG in /images/brands/. Brands without a logo show their initials.
const BRANDS = [
  ['Acura','acura'],['Adess'],['Alpine'],['Aston Martin','astonmartin'],['Audi','audi'],['BMW','bmw'],
  ['Cadillac','cadillac'],['Chevrolet','chevrolet'],['Corvette','chevrolet','Chevrolet'],['Dallara'],['Duqueine'],
  ['Ferrari','ferrari'],['Ford','ford'],['Genesis'],['Ginetta'],['Glickenhaus'],['Global Mazda','mazda','Mazda'],
  ['Honda','honda'],['HPD','honda','Honda'],['Hyundai','hyundai'],['Isotta Fraschini',null,'Isotta Fraschini'],
  ['Lamborghini','lamborghini'],['Lexus'],['Ligier'],['McLaren','mclaren'],['Mercedes',null,'Mercedes-AMG'],
  ['Nissan','nissan'],['Oreca'],['Peugeot','peugeot'],['Porsche','porsche'],['Renault','renault'],
  ['Supercars Chevrolet','chevrolet','Chevrolet'],['Supercars Ford','ford','Ford'],['Toyota','toyota'],['Vanwall']
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
