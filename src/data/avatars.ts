export const avatars = [
  { id: "fox", name: "Fuchs", src: "/avatars/fox.png" },
  { id: "bear", name: "Bär", src: "/avatars/bear.png" },
  { id: "rabbit", name: "Hase", src: "/avatars/rabbit.png" },
  { id: "panda", name: "Panda", src: "/avatars/panda.png" },
  { id: "cat", name: "Katze", src: "/avatars/cat.png" },
  { id: "dog", name: "Hund", src: "/avatars/dog.png" },
  { id: "raccoon", name: "Waschbär", src: "/avatars/raccoon.png" },
  { id: "otter", name: "Otter", src: "/avatars/otter.png" },
  { id: "red-panda", name: "Roter Panda", src: "/avatars/red-panda.png" },
  { id: "koala", name: "Koala", src: "/avatars/koala.png" },
  { id: "hedgehog", name: "Igel", src: "/avatars/hedgehog.png" },
  { id: "deer", name: "Reh", src: "/avatars/deer.png" },
  { id: "tiger", name: "Tiger", src: "/avatars/tiger.png" },
  { id: "lion", name: "Löwe", src: "/avatars/lion.png" },
  { id: "penguin", name: "Pinguin", src: "/avatars/penguin.png" },
  { id: "owl", name: "Eule", src: "/avatars/owl.png" },
  { id: "frog", name: "Frosch", src: "/avatars/frog.png" },
  { id: "capybara", name: "Capybara", src: "/avatars/capybara.png" },
  { id: "hamster", name: "Hamster", src: "/avatars/hamster.png" },
  { id: "alpaca", name: "Alpaka", src: "/avatars/alpaca.png" },
] as const;

export type AvatarId = (typeof avatars)[number]["id"];
export const avatarIds = avatars.map((avatar) => avatar.id);

export function getAvatar(avatarId: string | null | undefined) {
  return avatars.find((avatar) => avatar.id === avatarId) ?? avatars[0];
}

export function avatarIdForSeed(seed: string): AvatarId {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return avatars[hash % avatars.length].id;
}
