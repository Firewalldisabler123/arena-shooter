# Neon Arena

3D-Multiplayer-Arena-Shooter im Browser. Three.js + PeerJS (WebRTC, kein eigener Server) + Vite.

- **Spiel erstellen** → Raumcode wird angezeigt, an den Mitspieler weitergeben.
- **Spiel beitreten** → Raumcode eingeben.
- Desktop: WASD bewegen · Maus umsehen · Linksklick schießen · Leertaste springen.
- Handy/Tablet (Touch): links wischen = bewegen, rechts wischen = umsehen, Tasten FEUER und SPRUNG. Am besten im Querformat.
- 3 Treffer = 1 Kill, wer zuerst 3 Kills hat, gewinnt. Der Host verwaltet Treffer, Leben und Punkte.

## Entwickeln

```bash
npm install
npm run dev      # lokal starten
npm run build    # Produktions-Build nach dist/
```

## Veröffentlichung

Jeder Push auf `main` baut und veröffentlicht die Seite per GitHub Actions auf GitHub Pages
(Repo → Settings → Pages → Source: **GitHub Actions**).
