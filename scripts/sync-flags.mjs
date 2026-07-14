import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourceFile = join(root, "source-vn.html");
const sourceUrl = "https://www.welt-flaggen.de/organisation/vn";

if (!existsSync(sourceFile)) {
  throw new Error(`Missing ${sourceFile}. Download ${sourceUrl} first.`);
}

const html = await readFile(sourceFile, "utf8");
const section = html.slice(html.indexOf('id="toc-members"'), html.indexOf("Errate die Flagge"));
const pattern = /srcset="\/data\/flags\/h160\/([a-z]{2})\.png(?:\?[^\"]*)? 2x"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g;
const countries = [];

for (const match of section.matchAll(pattern)) {
  countries.push({ code: match[1], name: match[2].trim() });
}

if (countries.length !== 193) {
  throw new Error(`Expected 193 UN members, found ${countries.length}.`);
}

const aliasMap = {
  "bo": ["Bolivien"],
  "bn": ["Brunei Darussalam"],
  "ci": ["Cote d Ivoire", "Côte d’Ivoire"],
  "cd": ["DR Kongo", "Demokratische Republik Kongo", "Kongo Kinshasa"],
  "cg": ["Republik Kongo", "Kongo Brazzaville"],
  "cz": ["Tschechische Republik"],
  "gb": ["Großbritannien", "England", "UK"],
  "kr": ["Republik Korea"],
  "kp": ["Demokratische Volksrepublik Korea"],
  "la": ["Laotische Volksdemokratische Republik"],
  "md": ["Republik Moldau", "Moldau"],
  "mk": ["Mazedonien"],
  "mm": ["Burma"],
  "ps": ["Palästina"],
  "ru": ["Russische Föderation"],
  "sz": ["Eswatini"],
  "sy": ["Syrische Arabische Republik"],
  "tl": ["Timor-Leste"],
  "tz": ["Vereinigte Republik Tansania"],
  "us": ["USA", "United States", "Amerika"],
  "va": ["Vatikan", "Vatikanstadt"],
  "ve": ["Venezuela"],
  "vn": ["Viet Nam"],
};

const preferredNames = {
  "cd": "Demokratische Republik Kongo",
  "cg": "Republik Kongo",
  "sz": "Eswatini",
};

const output = countries.map((country) => ({
  ...country,
  name: preferredNames[country.code] ?? country.name,
  aliases: aliasMap[country.code] ?? [],
  flag: `/flags/${country.code}.png`,
}));

await mkdir(join(root, "src", "data"), { recursive: true });
await mkdir(join(root, "public", "flags"), { recursive: true });
await writeFile(
  join(root, "src", "data", "countries.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

let completed = 0;
for (const country of output) {
  const target = join(root, "public", "flags", `${country.code}.png`);
  if (!existsSync(target)) {
    const response = await fetch(`https://www.welt-flaggen.de/data/flags/h160/${country.code}.png`);
    if (!response.ok) throw new Error(`Failed ${country.code}: ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  completed += 1;
  if (completed % 25 === 0) console.log(`Downloaded ${completed}/193`);
}

console.log(`Ready: ${output.length} country records and flags from ${sourceUrl}`);
