# Flaggenfieber product notes

## Entry flow

- Keep the first screen progressive: it shows only `Raum erstellen` and `Raum beitreten`.
- Ask for the player name only after one of those choices is selected.
- Keep host settings and the join code inside the modal flow, not on the first screen.
- Preserve native dialog behavior: trapped focus, Escape, backdrop close, visible close button, and focus restoration.

## Visual direction

- Use the existing restrained Apple-inspired liquid-glass language: translucent white surfaces, subtle blur, soft shadows, generous spacing, and blue/green accents.
- Keep the experience desktop-first and fully usable at the 390 × 844 mobile viewport.
- Do not upscale the 160-pixel-high flag sources beyond their useful resolution.
