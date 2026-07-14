import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import countries from "../src/data/countries.json" with { type: "json" };

if (countries.length !== 193) throw new Error(`Expected 193 countries, got ${countries.length}.`);
const codes = new Set(countries.map((country) => country.code));
if (codes.size !== countries.length) throw new Error("Country codes must be unique.");

const flagDirectory = join(process.cwd(), "public", "flags");
const flagFiles = (await readdir(flagDirectory)).filter((file) => file.endsWith(".png"));
if (flagFiles.length !== 193) throw new Error(`Expected 193 flag files, got ${flagFiles.length}.`);

for (const country of countries) {
  const path = join(flagDirectory, `${country.code}.png`);
  await access(path);
  const file = await stat(path);
  if (file.size < 100) throw new Error(`Flag file ${country.code}.png looks invalid.`);
}

console.log("Verified 193 unique UN-member records and 193 local flag images.");
