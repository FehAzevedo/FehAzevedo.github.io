// Lê a ban list do Gym Leader Challenge (https://gymleaderchallenge.com/ban-list) e grava em
// mana-scanner-br/config.json (campo glcBans), que o app lê ao abrir. Cada entrada: { name, ids? } com os ids
// de impressão do TCGdex; sem ids, vale o nome (todas as versões). Qualquer dúvida na leitura = erro, sem gravar.
import { readFileSync, writeFileSync } from 'node:fs';

const PAGE = 'https://gymleaderchallenge.com/ban-list';
const CONFIG = new URL('../mana-scanner-br/config.json', import.meta.url);
const UA = 'TCGScannerBR-banlist/1.0 (+https://fehazevedo.github.io/mana-scanner-br/)';

const fail = (msg) => {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
};
const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) fail(`${url} respondeu ${res.status}`);
  return res;
};
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&eacute;/g, 'é');

// Texto da página entre "Ban List" e o aviso final, uma entrada por data "Effective ...".
const html = await (await get(PAGE)).text();
const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n'))
  .replace(/[ \t]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n');
const start = text.lastIndexOf('\nBan List\n');
const end = text.indexOf('Click on the effective date');
if (start < 0 || end < 0) fail('não achei a lista na página (o HTML mudou?)');
const chunks = text
  .slice(start + 10, end)
  .split(/Effective\s+[A-Z][a-z]{2}\.?\s+\d{1,2},\s+\d{4}/)
  .map((c) => c.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const entries = chunks.map((raw) => {
  const c = raw.replace(/[’‘]/g, "'");
  const m = c.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { name: m[1].trim(), detail: m[2].trim() } : { name: c, detail: '' };
});
if (entries.length < 5) fail(`só ${entries.length} entradas lidas`);

const norm = (s) => s.toLowerCase().replace(/^(xy|sm|swsh|sv|bw)\s*[:-]\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const api = async (path) => (await get(`https://api.tcgdex.net/v2/en${path}`)).json();

async function idsOf(name, detail) {
  if (!detail || /all other versions/i.test(detail)) return undefined;
  const cards = await api(`/cards?name=${encodeURIComponent(`eq:${name}`)}`);
  const ids = new Set();
  let lastSet = '';
  for (const token of detail.split(/,|\band\b|&/).map((t) => t.trim()).filter(Boolean)) {
    // Só o nome da edição (o número vem no item seguinte): vale para os próximos.
    if (!/\d/.test(token)) {
      lastSet = norm(token);
      continue;
    }
    const m = token.match(/^(.*?)\s*([A-Za-z]*\d+[a-z]?)(?:\/[A-Za-z]*\d+)?$/);
    if (!m) fail(`não entendi "${token}" em ${name}`);
    const setText = m[1] ? norm(m[1]) : lastSet;
    if (m[1]) lastSet = setText;
    const num = m[2].toLowerCase().replace(/^([a-z]*)0+(\d)/, '$1$2');
    let found = 0;
    for (const c of cards) {
      const local = String(c.localId).toLowerCase().replace(/^([a-z]*)0+(\d)/, '$1$2');
      if (local !== num) continue;
      const set = (await api(`/cards/${encodeURIComponent(c.id)}`)).set?.name ?? '';
      const setName = norm(set);
      const ok = /^promo/.test(setText) ? /promo/.test(setName) : setName === setText || setName.startsWith(setText) || setText.startsWith(setName);
      if (ok) {
        ids.add(c.id);
        found++;
      }
    }
    if (!found) fail(`não achei no TCGdex: ${name} (${token})`);
  }
  return [...ids].sort();
}

const bans = [];
for (const e of entries) {
  const ids = await idsOf(e.name, e.detail);
  bans.push(ids ? { name: e.name, ids } : { name: e.name });
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const before = Array.isArray(config.glcBans) ? config.glcBans : [];
if (before.length && bans.length < before.length / 2) fail(`a lista caiu de ${before.length} para ${bans.length}: revisar na mão`);
if (JSON.stringify(before) === JSON.stringify(bans)) {
  console.log('Sem mudanças.');
  process.exit(0);
}
config.glcBans = bans;
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Atualizada: ${bans.length} entradas (eram ${before.length}).`);
