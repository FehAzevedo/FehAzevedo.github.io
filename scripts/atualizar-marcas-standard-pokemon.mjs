// Descobre quais marcas de regulação (as letras no canto das cartas) estão no Standard do Pokémon TCG e grava em
// mana-scanner-br/config.json (campo pokemonStandardMarks), que o app mostra nas regras do formato. A cada rotação
// uma letra sai e outra entra. Qualquer resultado estranho (menos de 2 ou mais de 4 letras) = erro, sem gravar.
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = new URL('../mana-scanner-br/config.json', import.meta.url);
const UA = 'TCGScannerBR-marcas/1.0 (+https://fehazevedo.github.io/mana-scanner-br/)';
const api = async (path) => {
  const res = await fetch(`https://api.tcgdex.net/v2/en${path}`, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${path} respondeu ${res.status}`);
  return res.json();
};

const marks = [];
for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  const list = await api(`/cards?regulationMark=${encodeURIComponent(`eq:${letter}`)}&pagination:itemsPerPage=1`);
  if (!list.length) continue;
  const card = await api(`/cards/${encodeURIComponent(list[0].id)}`);
  if (card.legal?.standard === true) marks.push(letter);
}
if (marks.length < 2 || marks.length > 4) {
  console.error(`ERRO: ${marks.length} marcas no Standard (${marks.join(', ')}); revisar na mão`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
if (JSON.stringify(config.pokemonStandardMarks) === JSON.stringify(marks)) {
  console.log(`Sem mudanças (${marks.join(', ')}).`);
  process.exit(0);
}
config.pokemonStandardMarks = marks;
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Marcas do Standard: ${marks.join(', ')}.`);
