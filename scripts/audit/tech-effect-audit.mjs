// DEĞİŞTİRİCİ TÜKETİCİ DENETİMİ — "bu etki bir şeyi değiştiriyor mu?"
//
// Teknoloji, danışman, parti, hükûmet, gündem, karar ve olay etkileri tek bir
// değiştirici tablosuna yazılır (src/game/modifiers.js MODIFIER_KEYS). Bir
// anahtarın OKUYUCUSU yoksa o etki ekranda yazan ama oyunda olmayan bir
// vaattir. Denetim iki şeyi sınar:
//   1. Her etki anahtarı tabloda tanımlı mı (yazım hatası, eski ad)?
//   2. Tablodaki her anahtar src/ altında `mod(nation, '<anahtar>')` ile
//      okunuyor mu?
// Statik ve hızlıdır; davranış ölçümü audit:mechanics'tedir.
//
//   npm run audit:tech-effect

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODIFIER_KEYS } from '../../src/game/modifiers.js';
import { TECHNOLOGIES } from '../../src/game/technology.js';
import { ADVISOR_SLOTS, GOVERNMENTS, PARTIES } from '../../src/game/politics.js';
import { section, sub, finding, reportFindings } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const sources = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) sources.push(fs.readFileSync(full, 'utf8'));
  }
})(root);
const code = sources.join('\n');

section('DEĞİŞTİRİCİ TÜKETİCİ DENETİMİ');

const effectSources = [];
for (const folders of Object.values(TECHNOLOGIES)) {
  for (const list of Object.values(folders)) {
    for (const tech of list) effectSources.push([`tech ${tech.id}`, tech.effects]);
  }
}
for (const party of Object.values(PARTIES)) effectSources.push([`party ${party.id}`, party.effects]);
for (const government of Object.values(GOVERNMENTS)) effectSources.push([`government ${government.id}`, government.effects]);
for (const slot of Object.values(ADVISOR_SLOTS)) {
  for (const type of slot.types) effectSources.push([`advisor ${type.id}`, type.effects]);
}
// Gündem/karar/olay etkileri kaynak metninden: addTimedModifier/addIdea çağrılarındaki nesneler.
for (const match of code.matchAll(/(?:addTimedModifier|addIdea|timed)\([^)]*?\{([^}]*)\}/g)) {
  const keys = [...match[1].matchAll(/([a-zA-Z]+):/g)].map((m) => m[1]);
  effectSources.push(['code', Object.fromEntries(keys.map((k) => [k, 1]))]);
}

sub('1. Etki anahtarları tabloda mı?');
let unknown = 0;
for (const [label, effects] of effectSources) {
  for (const key of Object.keys(effects ?? {})) {
    if (!MODIFIER_KEYS[key]) {
      unknown++;
      finding('HIGH', `Tanımsız etki anahtarı "${key}"`, 'MODIFIER_KEYS içinde olmalı', label);
    }
  }
}
if (!unknown) console.log('  Bütün etki anahtarları tanımlı.');

sub('2. Her anahtarın okuyucusu var mı?');
let orphans = 0;
for (const key of Object.keys(MODIFIER_KEYS)) {
  const read = new RegExp(`mod\\([^)]*'${key}'\\)`).test(code);
  if (!read) {
    orphans++;
    finding('HIGH', `Okuyucusu olmayan değiştirici "${key}"`, 'en az bir sistem mod(nation, key) ile okumalı', 'src/ altında okuma yok');
  }
}
if (!orphans) console.log(`  ${Object.keys(MODIFIER_KEYS).length} anahtarın hepsi okunuyor.`);
process.exitCode = reportFindings() ? 1 : 0;
