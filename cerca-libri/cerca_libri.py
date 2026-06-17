#!/usr/bin/env python3
"""
cerca-libri — Cerca e scarica libri (PDF/EPUB) da fonti legali e gratuite.

Fonti interrogate (solo pubblico dominio / accesso aperto):
  - Project Gutenberg (via API Gutendex)
  - Internet Archive
  - Open Library (ebook ad accesso pubblico)
  - DOAB — Directory of Open Access Books
  - LibriVox (audiolibri di pubblico dominio)

Uso:
    python3 cerca_libri.py "La Divina Commedia"
    python3 cerca_libri.py "Pride and Prejudice" --formato epub
    python3 cerca_libri.py "Kant critica" --cartella ~/Libri --apri
    python3 cerca_libri.py "Inferno" --lingua it --num 20

Dai un titolo: l'app interroga tutte le fonti in parallelo, unisce e ordina i
risultati per pertinenza e popolarità, poi ti fa scegliere quale scaricare.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("Manca la libreria 'requests'. Installa con: pip install requests")


TIMEOUT = 20
HEADERS = {"User-Agent": "cerca-libri/2.0 (https://example.local)"}

# Link legale per il prestito digitale gratuito delle biblioteche italiane.
# MLOL non ha un'API pubblica e richiede la tessera della biblioteca, quindi
# non è scaricabile in automatico: lo proponiamo come suggerimento.
MLOL_HOME = "https://www.medialibrary.it"


# ---------------------------------------------------------------------------
# Modello dati
# ---------------------------------------------------------------------------
@dataclass
class Risultato:
    titolo: str
    autore: str
    anno: str
    fonte: str
    # mappa formato -> url di download, es. {"pdf": "...", "epub": "..."}
    formati: dict[str, str] = field(default_factory=dict)
    lingua: str = ""
    cover: str = ""
    popolarita: int = 0  # usato per ordinare (es. download di Gutenberg)
    archive_id: str = ""  # identificativo Internet Archive, per risolvere i file reali

    def url_per(self, formato_preferito: str | None) -> tuple[str, str] | None:
        """Restituisce (formato, url) scegliendo il formato preferito se presente."""
        if not self.formati:
            return None
        ordine = [formato_preferito] if formato_preferito else []
        ordine += ["pdf", "epub", "txt", "zip"]
        for fmt in ordine:
            if fmt and fmt in self.formati:
                return fmt, self.formati[fmt]
        fmt = next(iter(self.formati))
        return fmt, self.formati[fmt]


# ---------------------------------------------------------------------------
# Utilità di rete
# ---------------------------------------------------------------------------
def _get_json(url: str, params: dict | None = None):
    r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# Fonti
# ---------------------------------------------------------------------------
def cerca_gutenberg(titolo: str, limite: int, lingua: str = "") -> list[Risultato]:
    """Project Gutenberg tramite l'API Gutendex."""
    out: list[Risultato] = []
    try:
        params = {"search": titolo}
        if lingua:
            params["languages"] = lingua
        for libro in _get_json("https://gutendex.com/books", params).get("results", [])[:limite]:
            formati: dict[str, str] = {}
            cover = ""
            for mime, url in (libro.get("formats") or {}).items():
                if url.endswith(".zip"):
                    continue
                if "image" in mime and not cover:
                    cover = url
                elif "application/pdf" in mime:
                    formati["pdf"] = url
                elif "epub" in mime:
                    formati["epub"] = url
                elif mime.startswith("text/plain"):
                    formati.setdefault("txt", url)
            if not formati:
                continue
            autori = libro.get("authors") or []
            langs = libro.get("languages") or []
            out.append(
                Risultato(
                    titolo=libro.get("title", "(senza titolo)"),
                    autore=autori[0]["name"] if autori else "Sconosciuto",
                    anno="",
                    fonte="Project Gutenberg",
                    formati=formati,
                    lingua=langs[0] if langs else "",
                    cover=cover,
                    popolarita=int(libro.get("download_count") or 0),
                )
            )
    except (requests.RequestException, ValueError):
        pass
    return out


def cerca_internet_archive(titolo: str, limite: int) -> list[Risultato]:
    """Internet Archive (mediatype: texts)."""
    out: list[Risultato] = []
    try:
        data = _get_json(
            "https://archive.org/advancedsearch.php",
            {
                "q": (
                    f'title:("{titolo}") AND mediatype:texts '
                    "AND NOT access-restricted-item:true"
                ),
                "fl[]": ["identifier", "title", "creator", "year", "downloads"],
                "rows": limite,
                "output": "json",
            },
        )
        for doc in data.get("response", {}).get("docs", []):
            ident = doc.get("identifier")
            if not ident:
                continue
            creator = doc.get("creator", "Sconosciuto")
            if isinstance(creator, list):
                creator = creator[0] if creator else "Sconosciuto"
            out.append(
                Risultato(
                    titolo=str(doc.get("title", ident)),
                    autore=str(creator),
                    anno=str(doc.get("year", "")),
                    fonte="Internet Archive",
                    formati={
                        "pdf": f"https://archive.org/download/{ident}/{ident}.pdf",
                        "epub": f"https://archive.org/download/{ident}/{ident}.epub",
                    },
                    cover=f"https://archive.org/services/img/{ident}",
                    popolarita=int(doc.get("downloads") or 0),
                    archive_id=ident,
                )
            )
    except (requests.RequestException, ValueError):
        pass
    return out


def cerca_openlibrary(titolo: str, limite: int) -> list[Risultato]:
    """Open Library — solo ebook ad accesso pubblico (scaricati da Internet Archive)."""
    out: list[Risultato] = []
    try:
        data = _get_json(
            "https://openlibrary.org/search.json",
            {
                "q": titolo,
                "limit": limite * 2,
                "fields": "title,author_name,first_publish_year,cover_i,ia,ebook_access",
            },
        )
        for doc in data.get("docs", []):
            if doc.get("ebook_access") != "public":
                continue
            ia = doc.get("ia") or []
            if not ia:
                continue
            ident = ia[0]
            autori = doc.get("author_name") or []
            cover_i = doc.get("cover_i")
            out.append(
                Risultato(
                    titolo=doc.get("title", "(senza titolo)"),
                    autore=autori[0] if autori else "Sconosciuto",
                    anno=str(doc.get("first_publish_year", "")),
                    fonte="Open Library",
                    formati={
                        "pdf": f"https://archive.org/download/{ident}/{ident}.pdf",
                        "epub": f"https://archive.org/download/{ident}/{ident}.epub",
                    },
                    cover=f"https://covers.openlibrary.org/b/id/{cover_i}-M.jpg" if cover_i else "",
                    archive_id=ident,
                )
            )
            if len(out) >= limite:
                break
    except (requests.RequestException, ValueError):
        pass
    return out


def cerca_doab(titolo: str, limite: int) -> list[Risultato]:
    """DOAB — Directory of Open Access Books."""
    out: list[Risultato] = []
    try:
        data = _get_json(
            "https://directory.doabooks.org/rest/search",
            {"query": titolo, "expand": "metadata,bitstreams"},
        )
        for item in data[:limite]:
            meta = {m["key"]: m["value"] for m in item.get("metadata", [])}
            formati: dict[str, str] = {}
            for b in item.get("bitstreams", []):
                link = b.get("retrieveLink", "")
                if not link:
                    continue
                full = "https://directory.doabooks.org" + link
                name = (b.get("name") or "").lower()
                if name.endswith(".pdf") or "pdf" in (b.get("format", "").lower()):
                    formati.setdefault("pdf", full)
                elif name.endswith(".epub"):
                    formati.setdefault("epub", full)
            if not formati:
                continue
            out.append(
                Risultato(
                    titolo=meta.get("dc.title", item.get("name", "(senza titolo)")),
                    autore=meta.get("dc.contributor.author", "Sconosciuto"),
                    anno=str(meta.get("dc.date.issued", ""))[:4],
                    fonte="DOAB (Open Access)",
                    formati=formati,
                    lingua=meta.get("dc.language", ""),
                )
            )
    except (requests.RequestException, ValueError):
        pass
    return out


def cerca_librivox(titolo: str, limite: int) -> list[Risultato]:
    """LibriVox — audiolibri di pubblico dominio (MP3, scaricati come .zip)."""
    out: list[Risultato] = []
    try:
        data = _get_json(
            "https://librivox.org/api/feed/audiobooks",
            {"title": "^" + titolo, "format": "json", "limit": limite},
        )
        for libro in data.get("books", [])[:limite]:
            zip_url = libro.get("url_zip_file")
            if not zip_url:
                continue
            autori = libro.get("authors") or []
            if autori:
                a = autori[0]
                autore = f"{a.get('first_name', '')} {a.get('last_name', '')}".strip()
            else:
                autore = "Sconosciuto"
            out.append(
                Risultato(
                    titolo=libro.get("title", "(senza titolo)"),
                    autore=autore or "Sconosciuto",
                    anno="",
                    fonte="LibriVox (audiolibro MP3)",
                    formati={"zip": zip_url},
                )
            )
    except (requests.RequestException, ValueError):
        pass
    return out


# ---------------------------------------------------------------------------
# Aggregazione: ricerca parallela, deduplica, ordinamento
# ---------------------------------------------------------------------------
def cerca_tutte(titolo: str, limite: int, lingua: str = "") -> list[Risultato]:
    compiti = {
        "gutenberg": lambda: cerca_gutenberg(titolo, limite, lingua),
        "internet archive": lambda: cerca_internet_archive(titolo, limite),
        "open library": lambda: cerca_openlibrary(titolo, limite),
        "doab": lambda: cerca_doab(titolo, limite),
        "librivox": lambda: cerca_librivox(titolo, limite),
    }
    risultati: list[Risultato] = []
    with ThreadPoolExecutor(max_workers=len(compiti)) as ex:
        futuri = {ex.submit(fn): nome for nome, fn in compiti.items()}
        for fut, nome in futuri.items():
            try:
                trovati = fut.result()
            except Exception:
                trovati = []
            print(f"  · {nome}: {len(trovati)}", flush=True)
            risultati.extend(trovati)
    return _ordina(_dedup(risultati), titolo)


def _normalizza(s: str) -> str:
    return re.sub(r"[^\w]+", " ", s.lower(), flags=re.UNICODE).strip()


def _dedup(risultati: list[Risultato]) -> list[Risultato]:
    """Unisce risultati con stesso titolo+autore, fondendo i formati."""
    visti: dict[tuple[str, str], Risultato] = {}
    for r in risultati:
        chiave = (_normalizza(r.titolo), _normalizza(r.autore))
        if chiave in visti:
            base = visti[chiave]
            for fmt, url in r.formati.items():
                base.formati.setdefault(fmt, url)
            if not base.cover and r.cover:
                base.cover = r.cover
            base.popolarita = max(base.popolarita, r.popolarita)
        else:
            visti[chiave] = r
    return list(visti.values())


def _ordina(risultati: list[Risultato], query: str) -> list[Risultato]:
    q = _normalizza(query)

    def chiave(r: Risultato):
        t = _normalizza(r.titolo)
        if t == q:
            rilevanza = 0
        elif t.startswith(q):
            rilevanza = 1
        elif q in t:
            rilevanza = 2
        else:
            rilevanza = 3
        return (rilevanza, -r.popolarita)

    return sorted(risultati, key=chiave)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------
def formati_archive(ident: str) -> dict[str, str]:
    """Risolve i nomi-file reali di un item Internet Archive via API metadata.

    Lo schema {ident}/{ident}.pdf non è sempre valido: qui leggiamo l'elenco
    file effettivo e mappiamo i formati scaricabili.
    """
    out: dict[str, str] = {}
    try:
        meta = _get_json(f"https://archive.org/metadata/{ident}")
    except (requests.RequestException, ValueError):
        return out
    for f in meta.get("files", []):
        name = f.get("name", "")
        low = name.lower()
        url = f"https://archive.org/download/{ident}/" + requests.utils.quote(name)
        if low.endswith(".pdf"):
            out.setdefault("pdf", url)
        elif low.endswith(".epub"):
            out.setdefault("epub", url)
        elif low.endswith("_djvu.txt"):
            out.setdefault("txt", url)
    return out


def nome_file(titolo: str, formato: str) -> str:
    base = re.sub(r"[^\w\s-]", "", titolo, flags=re.UNICODE).strip()
    base = re.sub(r"\s+", "_", base)[:80] or "libro"
    return f"{base}.{formato}"


def _barra(fatti: int, totale: int, larghezza: int = 30) -> None:
    if totale <= 0:
        return
    quota = min(fatti / totale, 1.0)
    pieni = int(quota * larghezza)
    barra = "█" * pieni + "░" * (larghezza - pieni)
    mb = fatti / 1_048_576
    print(f"\r   [{barra}] {quota*100:5.1f}%  {mb:6.2f} MB", end="", flush=True)


def scarica(url: str, percorso: str) -> bool:
    try:
        with requests.get(url, headers=HEADERS, timeout=TIMEOUT, stream=True) as r:
            r.raise_for_status()
            if "html" in r.headers.get("Content-Type", "").lower():
                return False  # probabilmente una pagina di errore, non il file
            totale = int(r.headers.get("Content-Length") or 0)
            fatti = 0
            with open(percorso, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if not chunk:
                        continue
                    f.write(chunk)
                    fatti += len(chunk)
                    _barra(fatti, totale)
        if totale:
            print()
        return os.path.getsize(percorso) > 1024
    except requests.RequestException:
        if os.path.exists(percorso):
            os.remove(percorso)
        return False


def _apri(percorso: str) -> None:
    try:
        if sys.platform == "darwin":
            os.system(f'open "{percorso}"')
        elif sys.platform.startswith("win"):
            os.startfile(percorso)  # type: ignore[attr-defined]
        else:
            os.system(f'xdg-open "{percorso}" >/dev/null 2>&1 &')
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Interfaccia a riga di comando
# ---------------------------------------------------------------------------
def _stampa_risultati(risultati: list[Risultato]) -> None:
    print(f"\n✅ Trovati {len(risultati)} risultati:\n")
    for i, r in enumerate(risultati, 1):
        anno = f" ({r.anno})" if r.anno else ""
        lingua = f" [{r.lingua}]" if r.lingua else ""
        fmt = ", ".join(sorted(r.formati))
        pop = f" · ⭐{r.popolarita}" if r.popolarita else ""
        print(f"  [{i}] {r.titolo}{anno}{lingua}")
        print(f"      di {r.autore} — {r.fonte} — formati: {fmt}{pop}")


def main() -> int:
    p = argparse.ArgumentParser(
        description="Cerca e scarica libri PDF/EPUB da fonti legali e gratuite."
    )
    p.add_argument("titolo", nargs="+", help="Titolo del libro da cercare")
    p.add_argument("--formato", "-f", choices=["pdf", "epub", "txt", "zip"], default="pdf",
                   help="Formato preferito (default: pdf)")
    p.add_argument("--cartella", "-c", default=".", help="Cartella di destinazione")
    p.add_argument("--num", "-n", type=int, default=10, help="Quanti risultati mostrare (default: 10)")
    p.add_argument("--lingua", "-l", default="", help="Filtro lingua per Gutenberg (es. it, en, fr)")
    p.add_argument("--auto", action="store_true",
                   help="Scarica automaticamente il primo risultato valido")
    p.add_argument("--apri", action="store_true", help="Apri il file dopo il download")
    args = p.parse_args()

    titolo = " ".join(args.titolo)
    print(f'\n🔎 Cerco "{titolo}" su 5 fonti legali...\n')
    risultati = cerca_tutte(titolo, max(args.num, 5), args.lingua)

    if not risultati:
        print("\n❌ Nessun libro trovato sulle fonti gratuite per questo titolo.")
        print("   Suggerimento: prova con il titolo originale o solo l'autore.")
        return 1

    risultati = risultati[: args.num]
    _stampa_risultati(risultati)

    print(
        f"\n💡 Cerchi un titolo recente sotto copyright? In modo legale puoi "
        f"prenderlo in\n   prestito digitale gratuito dalla tua biblioteca con "
        f"MLOL (serve la tessera):\n   {MLOL_HOME}/cerca?keywords="
        + re.sub(r"\s+", "+", titolo.strip())
    )

    if args.auto:
        scelte = list(range(len(risultati)))
    else:
        print()
        raw = input("Quale vuoi scaricare? (numero, oppure Invio per annullare) > ").strip()
        if not raw.isdigit() or not (1 <= int(raw) <= len(risultati)):
            print("Annullato.")
            return 0
        scelte = [int(raw) - 1]

    os.makedirs(args.cartella, exist_ok=True)
    for idx in scelte:
        r = risultati[idx]
        # Per Internet Archive / Open Library risolviamo i file reali (più affidabile).
        if r.archive_id:
            reali = formati_archive(r.archive_id)
            if reali:
                r.formati = {**r.formati, **reali}
        scelta_url = r.url_per(args.formato)
        if not scelta_url:
            continue
        formato, url = scelta_url
        dest = os.path.join(args.cartella, nome_file(r.titolo, formato))
        print(f"\n⬇️  Scarico «{r.titolo}» ({formato}) da {r.fonte}...")
        ok = scarica(url, dest)
        if not ok:
            # proviamo gli altri formati disponibili
            for altro in r.formati:
                if altro == formato:
                    continue
                dest = os.path.join(args.cartella, nome_file(r.titolo, altro))
                print(f"   Riprovo in formato {altro}...")
                if scarica(r.formati[altro], dest):
                    ok = True
                    break
        if ok:
            print(f"✅ Salvato in: {dest}")
            if args.apri:
                _apri(dest)
            if not args.auto:
                return 0
        else:
            print("⚠️  Download non riuscito per questo risultato.")
            if not args.auto:
                print("   Prova un altro risultato.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrotto.")
        sys.exit(130)
