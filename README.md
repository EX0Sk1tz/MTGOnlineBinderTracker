# MTG Binder Tracker

Eine statische GitHub Pages App, mit der du verfolgen kannst, welche Magic Karten du in welcher Version in deinem Binder hast.

## Funktionen

- Kartensuche über Scryfall
- Auswahl von Printings als großes Bild Grid im Hinzufügen Dialog
- Binder Ansicht als responsives Grid
- Preisanzeige pro Eintrag
- Gesamtwert Übersicht
- globale Anzeige Settings für alle Binder Karten
- lokales Speichern im Browser
- JSON Export und Import
- optional vorbereitete Preisquelle über Cardmarket Proxy

## Aktueller Speicherstand

Die App speichert aktuell nur lokal im Browser.

Das bedeutet:

- deine Daten werden im `localStorage` des aktuellen Browsers gespeichert
- auf demselben Gerät und im selben Browser bleiben die Karten erhalten
- auf einem anderen Gerät oder in einem anderen Browser sind die Daten nicht automatisch verfügbar
- für einen Umzug zwischen Geräten kannst du JSON Export und Import nutzen

## Verwendete APIs

### Scryfall

Scryfall wird genutzt für:

- Kartensuche
- Laden aller Printings
- Kartengrafiken
- Preisfelder wie `eur`, `eur_foil` und `eur_etched`

### Cardmarket

Cardmarket ist aktuell nur als optionale spätere Preisquelle vorgesehen.

Direkter Zugriff aus GitHub Pages ist nicht Teil der Standardversion. Wenn du später Cardmarket Preise nutzen willst, solltest du dafür einen eigenen Proxy verwenden.

## Projektstruktur

```text
.
├── index.html
├── styles.css
├── app.js
└── README.md