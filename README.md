# Flaggenfieber

Ein schnelles Multiplayer-Flaggenquiz für private Runden mit Freunden. Der Host erstellt einen Raum, teilt den sechsstelligen Code und startet nacheinander Flaggenrunden. Wer eine Flagge zuerst erkennt, erhält 10 Punkte, danach 9, 8 und so weiter bis mindestens 1 Punkt.

## Fertiger Funktionsumfang

- Namensprofil mit dauerhaftem, zufällig zugeordnetem Tier-Avatar
- 20 individuell generierte Tier-Avatare im konsistenten 3D-Illustrationsstil
- Dauerhafte Gesamtpunkte, Spiele und Siege pro Name
- Host-Lobby mit teilbarem Raumcode
- Einstellbare Rundenzeit von 8 bis 45 Sekunden
- Einstellbares Punkteziel von 100 bis 500 Punkten
- 193 lokal gespeicherte Flaggen aller UN-Mitgliedstaaten
- Deutsche Ländernamen und gebräuchliche Alternativnamen
- Akustischer Countdown in den letzten drei Sekunden
- Atomare Punktevergabe bei nahezu gleichzeitigen Antworten
- Live-Aktualisierung von Teilnehmern, Antworten und Rangliste
- Ergebnisbildschirm und persönliche Gesamtbilanz
- Responsive Oberfläche für Desktop, Tablet und Smartphone
- Lokaler Demo-Modus ohne Zugangsdaten

## Technik

- Next.js 16 / React 19 / TypeScript
- Supabase Postgres als dauerhafte Datenbank
- Serverseitige Next.js-Routen als geschützte Spielautorität
- Vercel-kompatibler Produktions-Build
- GitHub Actions für Typprüfung, Lint, Datensatzprüfung und Build

Die Oberfläche fragt die Serverrouten alle 800 ms ab. Für kleine private Spielrunden ist das robust und praktisch verzögerungsfrei, ohne Tabellen direkt im Browser freigeben zu müssen. RLS ist auf allen öffentlichen Tabellen aktiviert; `anon` und `authenticated` haben keinen Tabellenzugriff. Der Supabase-Service-Key bleibt ausschließlich auf dem Server.

## Lokal starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev
```

Ohne `.env.local` startet die App automatisch im lokalen Demo-Modus. Dieser speichert Daten nur im laufenden Entwicklungsprozess und ist nicht für eine Vercel-Bereitstellung gedacht.

## Supabase verbinden

1. Ein neues Supabase-Projekt anlegen.
2. Den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) im Supabase SQL Editor einmal ausführen.
3. `.env.example` nach `.env.local` kopieren und die folgenden Werte eintragen:

```dotenv
SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
PLAYER_COOKIE_SECRET=eine-lange-zufaellige-zeichenfolge
```

`SUPABASE_URL` und `SUPABASE_SECRET_KEY` werden von der offiziellen Supabase/Vercel-Integration automatisch gesetzt. Alternativ unterstützt die App weiterhin die manuellen Variablen `NEXT_PUBLIC_SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`. Der geheime Schlüssel darf niemals mit `NEXT_PUBLIC_` beginnen oder in Browsercode verwendet werden. Der Publishable Key ist für eine spätere direkte Realtime-Erweiterung vorbereitet; der aktuelle sichere Serverbetrieb benötigt ihn nicht im Browser.

Danach neu starten und prüfen:

```bash
npm run test
npm run build
```

## Auf Vercel veröffentlichen

1. Das GitHub-Repository in Vercel importieren.
2. Framework Preset `Next.js` verwenden.
3. Die vier Werte aus `.env.local` unter **Project Settings → Environment Variables** für Production, Preview und Development eintragen.
4. Deploy auslösen. Es ist keine zusätzliche Build-Konfiguration nötig.

## Zu GitHub hochladen

Das lokale Repository ist bereits initialisiert. Sobald Zielkonto und Repository-Name feststehen:

```bash
git add .
git commit -m "Build multiplayer flag quiz"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/DEIN-REPO.git
git push -u origin main
```

Alternativ kann das Repository zuerst auf GitHub angelegt und anschließend als `origin` verbunden werden.

## Namensidentität

Die gewünschte einfache Identität ist absichtlich namensbasiert: Wer denselben Namen eingibt, landet wieder im selben Profil. Das passt zu privaten Freundesrunden, ist aber keine sichere Anmeldung — jemand, der denselben Namen kennt, kann dieses Profil übernehmen. Für öffentliche Nutzung sollte Supabase Auth mit Magic Link, Passkey oder OAuth ergänzt werden.

## Flaggen-Datensatz

Die 193 Ländernamen und PNG-Flaggen wurden aus der vom Auftraggeber genannten Liste [„Flaggen von VN-Mitgliedern (193)”](https://www.welt-flaggen.de/organisation/vn#toc-members) übernommen. Das reproduzierbare Skript liegt unter [`scripts/sync-flags.mjs`](scripts/sync-flags.mjs). Laut den [Nutzungsbedingungen von Flagpedia](https://flagpedia.net/terms) sind die bereitgestellten Flaggenbilder gemeinfrei und frei verwendbar.

```bash
# Nachdem source-vn.html lokal gespeichert wurde:
npm run sync:flags
```

## Projektstruktur

```text
src/app/                  Seiten und Serverrouten
src/lib/game-service.ts   Supabase- und Demo-Spiellogik
src/data/countries.json   193 Länder, Aliasse und lokale Bildpfade
src/data/avatars.ts       Avatar-Katalog und stabile Fallback-Zuordnung
public/flags/             193 lokale PNG-Flaggen
public/avatars/           20 generierte Tier-Avatare
supabase/schema.sql       Tabellen, RLS, Trigger und Punktelogik
scripts/                  Datensatz-Synchronisierung und Prüfung
```
