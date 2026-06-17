# cerca-libri 📚

App da riga di comando: dai un **titolo** e lei cerca il libro su Internet
e te lo scarica in **PDF** (o EPUB / TXT).

Cerca **solo su fonti legali e gratuite**, ovvero libri di pubblico dominio o
ad accesso aperto:

- **Project Gutenberg** (classici di pubblico dominio)
- **Internet Archive** (testi digitalizzati, solo item liberamente scaricabili)
- **Open Library** (ebook ad accesso pubblico)
- **DOAB** — Directory of Open Access Books (saggistica accademica open access)
- **LibriVox** (audiolibri di pubblico dominio, MP3 in archivio `.zip`)

### Caratteristiche

- 🔀 **Ricerca in parallelo** su tutte le fonti (veloce)
- 🧹 **Deduplica** dei risultati identici (formati uniti tra fonti)
- 🏆 **Ordinamento** per pertinenza del titolo e popolarità
- 📊 **Barra di avanzamento** durante il download
- 🖼️ Copertina e lingua quando disponibili
- 🔧 Per Internet Archive/Open Library il nome-file reale viene risolto via API
  metadata, così il download è affidabile

> ⚠️ L'app non scarica libri protetti da copyright da siti pirata: è pensata
> per i tantissimi testi disponibili legalmente e gratuitamente.

### E i libri recenti sotto copyright?

Per quelli l'app non scarica nulla (sarebbe pirateria). In modo **legale** puoi
prenderli in **prestito digitale gratuito** dalla tua biblioteca: in Italia con
**MLOL — MediaLibraryOnline** (serve la tessera della biblioteca). L'app, a fine
ricerca, stampa un link pronto alla ricerca su MLOL. MLOL non ha un'API pubblica
e richiede il login, quindi non è automatizzabile come download diretto.

## Installazione

```bash
pip install -r requirements.txt
```

## Uso

```bash
# Cerca e poi scegli quale scaricare
python3 cerca_libri.py "La Divina Commedia"

# Formato preferito EPUB
python3 cerca_libri.py "Pride and Prejudice" --formato epub

# Salva in una cartella specifica
python3 cerca_libri.py "Frankenstein" --cartella ~/Libri

# Scarica automaticamente il primo risultato valido (senza chiedere)
python3 cerca_libri.py "Moby Dick" --auto
```

### Opzioni

| Opzione | Descrizione |
|---|---|
| `--formato` / `-f` | `pdf` (default), `epub`, `txt` o `zip` |
| `--cartella` / `-c` | Cartella di destinazione (default: corrente) |
| `--num` / `-n` | Quanti risultati mostrare (default: 10) |
| `--lingua` / `-l` | Filtro lingua per Gutenberg (es. `it`, `en`, `fr`) |
| `--auto` | Scarica il primo risultato valido senza chiedere |
| `--apri` | Apre il file subito dopo il download |

## Come funziona

1. Interroga **in parallelo** le API delle fonti gratuite.
2. Raccoglie titolo, autore, anno, lingua, copertina e link di download.
3. **Deduplica** e **ordina** per pertinenza e popolarità.
4. Mostra l'elenco numerato e ti fa scegliere.
5. Scarica nel formato preferito (con fallback sugli altri formati). Per
   Internet Archive/Open Library risolve prima il nome-file reale via API.
