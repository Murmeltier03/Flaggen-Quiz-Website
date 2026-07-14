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

const avatarDirectory = join(process.cwd(), "public", "avatars");
const avatarFiles = (await readdir(avatarDirectory)).filter((file) => file.endsWith(".png"));
const expectedAvatars = [
  "alpaca.png", "bear.png", "capybara.png", "cat.png", "deer.png", "dog.png", "fox.png",
  "frog.png", "hamster.png", "hedgehog.png", "koala.png", "lion.png", "otter.png", "owl.png",
  "panda.png", "penguin.png", "rabbit.png", "raccoon.png", "red-panda.png", "tiger.png",
];
if (avatarFiles.sort().join("|") !== expectedAvatars.join("|")) {
  throw new Error(`Avatar set is incomplete or contains unexpected files: ${avatarFiles.join(", ")}`);
}
for (const avatarFile of expectedAvatars) {
  const file = await stat(join(avatarDirectory, avatarFile));
  if (file.size < 10_000) throw new Error(`Avatar file ${avatarFile} looks invalid.`);
}

console.log("Verified 20 generated animal avatar images.");
