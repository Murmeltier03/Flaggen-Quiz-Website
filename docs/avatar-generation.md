# Tier-Avatar-System

Die 20 Avatare wurden mit dem eingebauten Bildgenerierungswerkzeug als einzelne quadratische PNG-Dateien erzeugt. Für jedes Tier wurde ein eigener Generierungslauf verwendet.

## Gemeinsame Prompt-Spezifikation

```text
Use case: stylized-concept
Asset type: square player avatar for a premium minimalist desktop-first flag quiz website
Primary request: Create one adorable <ANIMAL> avatar as a polished minimalist 3D clay illustration.
Scene/backdrop: clean single-color warm pastel background with no scenery, props, pattern or text.
Subject: exactly one friendly animal, head and shoulders, front-facing with a slight natural turn, rounded proportions and a gentle expression.
Style/medium: cohesive premium 3D clay render, soft matte surfaces, subtle tactile detail, refined rather than childish.
Composition/framing: centered square portrait with generous padding, fully safe for a circular crop and clear at small avatar size.
Lighting/mood: soft diffused studio light, calm and welcoming.
Constraints: no accessories, clothing, props, text, letters, logo, frame, border or watermark; no photorealism or busy background.
```

## Tiere und Dateien

| Tier | Datei |
| --- | --- |
| Fuchs | `fox.png` |
| Bär | `bear.png` |
| Hase | `rabbit.png` |
| Panda | `panda.png` |
| Katze | `cat.png` |
| Hund | `dog.png` |
| Waschbär | `raccoon.png` |
| Otter | `otter.png` |
| Roter Panda | `red-panda.png` |
| Koala | `koala.png` |
| Igel | `hedgehog.png` |
| Reh | `deer.png` |
| Tiger | `tiger.png` |
| Löwe | `lion.png` |
| Pinguin | `penguin.png` |
| Eule | `owl.png` |
| Frosch | `frog.png` |
| Capybara | `capybara.png` |
| Hamster | `hamster.png` |
| Alpaka | `alpaca.png` |

Neue Profile erhalten serverseitig einen kryptografisch zufällig ausgewählten Eintrag. Bestehende Namen behalten die in Supabase oder im Demo-Speicher gesicherte `avatar_id`.
