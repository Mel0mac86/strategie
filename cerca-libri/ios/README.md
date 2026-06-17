# Cerca Libri — App iPhone (SwiftUI)

Versione iOS dell'app: cerchi un libro per **titolo** e lo scarichi in
**PDF / EPUB / TXT** da fonti legali e gratuite (Project Gutenberg,
Internet Archive, **Open Library**, DOAB, **LibriVox** per gli audiolibri). I
risultati mostrano la **copertina**, sono **deduplicati** e **ordinati** per
pertinenza e popolarità. Il file scaricato si apre direttamente nell'app con
l'anteprima Quick Look e da lì puoi salvarlo nei *File* o condividerlo. In fondo
alla schermata c'è anche un link alla ricerca su **MLOL** (prestito digitale
delle biblioteche italiane, serve la tessera).

## Come avviarla (serve un Mac con Xcode)

1. Apri **Xcode** → *File ▸ New ▸ Project… ▸ iOS ▸ App*.
2. Nome prodotto: `CercaLibri`, Interface: **SwiftUI**, Language: **Swift**.
3. Nel nuovo progetto **sostituisci/aggiungi** questi file (cartella
   `CercaLibri/`):
   - `CercaLibriApp.swift`
   - `ContentView.swift`
   - `Models.swift`
   - `BookService.swift`
   (Trascinali nel navigatore di Xcode; rimuovi il `ContentView.swift`
   generato di default se confligge.)
4. Premi **▶︎ Run** su un simulatore iPhone o sul tuo iPhone.

Requisiti: **iOS 17+** (usa `ContentUnavailableView` e
`.quickLookPreview`). Per iOS più vecchi vedi le note sotto.

## Permessi di rete

L'app fa solo richieste **HTTPS** verso le API pubbliche, quindi non serve
configurare nulla. (Se in futuro aggiungi domini in HTTP, dovrai impostare
`NSAppTransportSecurity` in `Info.plist`.)

## File del progetto

| File | Ruolo |
|---|---|
| `CercaLibriApp.swift` | Punto di ingresso dell'app |
| `ContentView.swift` | Interfaccia: ricerca, lista risultati, download, anteprima |
| `Models.swift` | Modello `Libro` |
| `BookService.swift` | Chiamate alle 5 fonti, dedup/ordina + download (async/await) |

## Note

- ⚠️ Solo contenuti **legali e gratuiti** (pubblico dominio / open access).
- Se vuoi supportare **iOS 16**, sostituisci `ContentUnavailableView` con una
  semplice `VStack` di testo e usa un foglio con `QLPreviewController`
  invece di `.quickLookPreview`.
- La ricerca interroga le 5 fonti **in parallelo** (`async let`), poi
  deduplica e ordina i risultati.
