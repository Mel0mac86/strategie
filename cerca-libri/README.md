# cerca-libri 📚

App da riga di comando: dai un **titolo** e lei cerca il libro su Internet
e te lo scarica in **PDF** (o EPUB / TXT).

Cerca **solo su fonti legali e gratuite**, ovvero libri di pubblico dominio o
ad accesso aperto:

- **Project Gutenberg** (classici di pubblico dominio)
- **Internet Archive** (testi digitalizzati)
- **DOAB** — Directory of Open Access Books (saggistica accademica open access)
- **LibriVox** (audiolibri di pubblico dominio, MP3 in archivio `.zip`)

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
| `--formato` / `-f` | `pdf` (default), `epub` o `txt` |
| `--cartella` / `-c` | Cartella di destinazione (default: corrente) |
| `--auto` | Scarica il primo risultato valido senza chiedere |

## Come funziona

1. Interroga in sequenza le API delle fonti gratuite.
2. Raccoglie titolo, autore, anno e i link di download disponibili.
3. Mostra l'elenco numerato e ti fa scegliere.
4. Scarica il file nel formato preferito (con fallback su un altro formato
   se il primo non è disponibile).
