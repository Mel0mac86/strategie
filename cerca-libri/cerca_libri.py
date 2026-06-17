#!/usr/bin/env python3
"""
cerca-libri — Cerca e scarica libri (PDF/EPUB) da fonti legali e gratuite.

Fonti interrogate (solo pubblico dominio / accesso aperto):
  - Project Gutenberg (via API Gutendex)
  - Internet Archive
  - Open Library (rimanda ad Internet Archive)
  - DOAB — Directory of Open Access Books

Uso:
    python3 cerca_libri.py "La Divina Commedia"
    python3 cerca_libri.py "Pride and Prejudice" --formato epub
    python3 cerca_libri.py "Kant critica" --cartella ~/Libri

Dai un titolo: l'app cerca su tutte le fonti, mostra i risultati e ti fa
scegliere quale scaricare.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("Manca la libreria 'requests'. Installa con: pip install requests")


TIMEOUT = 20
HEADERS = {"User-Agent": "cerca-libri/1.0 (https://example.local)"}


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

    def url_per(self, formato_preferito: str | None) -> tuple[str, str] | None:
        """Restituisce (formato, url) scegliendo il formato preferito se presente."""
        if not self.formati:
            return None
        ordine = [formato_preferito] if formato_preferito else []
        ordine += ["pdf", "epub", "txt"]
        for fmt in ordine:
            if fmt and fmt in self.formati:
                return fmt, self.formati[fmt]
        # qualsiasi cosa disponibile
        fmt = next(iter(self.formati))
        return fmt, self.formati[fmt]


# ---------------------------------------------------------------------------
# Fonti
# ---------------------------------------------------------------------------
def cerca_gutenberg(titolo: str, limite: int = 5) -> list[Risultato]:
    """Project Gutenberg tramite l'API Gutendex."""
    out: list[Risultato] = []
    try:
        r = requests.get(
            "https://gutendex.com/books",
            params={"search": titolo},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        for libro in r.json().get("results", [])[:limite]:
            formati: dict[str, str] = {}
            for mime, url in (libro.get("formats") or {}).items():
                if url.endswith(".zip"):
                    continue
                if "application/pdf" in mime:
                    formati["pdf"] = url
                elif "epub" in mime:
                    formati["epub"] = url
                elif mime.startswith("text/plain"):
                    formati.setdefault("txt", url)
            if not formati:
                continue
            autori = libro.get("authors") or []
            out.append(
                Risultato(
                    titolo=libro.get("title", "(senza titolo)"),
                    autore=autori[0]["name"] if autori else "Sconosciuto",
                    anno="",
                    fonte="Project Gutenberg",
                    formati=formati,
                )
            )
    except requests.RequestException:
        pass
    return out


def cerca_internet_archive(titolo: str, limite: int = 5) -> list[Risultato]:
    """Internet Archive (mediatype: texts)."""
    out: list[Risultato] = []
    try:
        r = requests.get(
            "https://archive.org/advancedsearch.php",
            params={
                "q": f'title:("{titolo}") AND mediatype:texts',
                "fl[]": ["identifier", "title", "creator", "year"],
                "rows": limite,
                "output": "json",
            },
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        for doc in r.json().get("response", {}).get("docs", []):
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
                    # download diretto dei formati derivati standard
                    formati={
                        "pdf": f"https://archive.org/download/{ident}/{ident}.pdf",
                        "epub": f"https://archive.org/download/{ident}/{ident}.epub",
                    },
                )
            )
    except requests.RequestException:
        pass
    return out


def cerca_doab(titolo: str, limite: int = 5) -> list[Risultato]:
    """DOAB — Directory of Open Access Books."""
    out: list[Risultato] = []
    try:
        r = requests.get(
            "https://directory.doabooks.org/rest/search",
            params={"query": titolo, "expand": "metadata,bitstreams"},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        for item in r.json()[:limite]:
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
                )
            )
    except (requests.RequestException, ValueError):
        pass
    return out


FONTI = [cerca_gutenberg, cerca_internet_archive, cerca_doab]


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------
def nome_file(titolo: str, formato: str) -> str:
    base = re.sub(r"[^\w\s-]", "", titolo, flags=re.UNICODE).strip()
    base = re.sub(r"\s+", "_", base)[:80] or "libro"
    return f"{base}.{formato}"


def scarica(url: str, percorso: str) -> bool:
    try:
        with requests.get(url, headers=HEADERS, timeout=TIMEOUT, stream=True) as r:
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "")
            if "html" in ctype.lower():
                return False  # probabilmente una pagina di errore, non il file
            with open(percorso, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        # un PDF/EPUB valido non è quasi mai più piccolo di 1 KB
        return os.path.getsize(percorso) > 1024
    except requests.RequestException:
        if os.path.exists(percorso):
            os.remove(percorso)
        return False


# ---------------------------------------------------------------------------
# Interfaccia a riga di comando
# ---------------------------------------------------------------------------
def cerca_tutte(titolo: str) -> list[Risultato]:
    risultati: list[Risultato] = []
    for fonte in FONTI:
        print(f"  · cerco su {fonte.__name__.replace('cerca_', '')}...", flush=True)
        risultati.extend(fonte(titolo))
    return risultati


def main() -> int:
    p = argparse.ArgumentParser(
        description="Cerca e scarica libri PDF/EPUB da fonti legali e gratuite."
    )
    p.add_argument("titolo", nargs="+", help="Titolo del libro da cercare")
    p.add_argument(
        "--formato", "-f", choices=["pdf", "epub", "txt"], default="pdf",
        help="Formato preferito (default: pdf)",
    )
    p.add_argument(
        "--cartella", "-c", default=".", help="Cartella di destinazione (default: corrente)"
    )
    p.add_argument(
        "--auto", action="store_true",
        help="Scarica automaticamente il primo risultato valido senza chiedere",
    )
    args = p.parse_args()

    titolo = " ".join(args.titolo)
    print(f'\n🔎 Cerco "{titolo}"...\n')
    risultati = cerca_tutte(titolo)

    if not risultati:
        print("\n❌ Nessun libro trovato sulle fonti gratuite per questo titolo.")
        print("   Suggerimento: prova con il titolo originale o solo l'autore.")
        return 1

    print(f"\n✅ Trovati {len(risultati)} risultati:\n")
    for i, r in enumerate(risultati, 1):
        anno = f" ({r.anno})" if r.anno else ""
        fmt = ", ".join(sorted(r.formati))
        print(f"  [{i}] {r.titolo}{anno}")
        print(f"      di {r.autore} — {r.fonte} — formati: {fmt}")

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
        scelta_url = r.url_per(args.formato)
        if not scelta_url:
            continue
        formato, url = scelta_url
        dest = os.path.join(args.cartella, nome_file(r.titolo, formato))
        print(f"\n⬇️  Scarico «{r.titolo}» ({formato}) da {r.fonte}...")
        if scarica(url, dest):
            print(f"✅ Salvato in: {dest}")
            if not args.auto:
                return 0
        else:
            print("⚠️  Download non riuscito per questo risultato.")
            if args.auto:
                continue
            # in modalità interattiva proviamo l'altro formato se c'è
            altro = next((f for f in r.formati if f != formato), None)
            if altro:
                dest2 = os.path.join(args.cartella, nome_file(r.titolo, altro))
                print(f"   Riprovo in formato {altro}...")
                if scarica(r.formati[altro], dest2):
                    print(f"✅ Salvato in: {dest2}")
                    return 0
            print("   Prova un altro risultato.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrotto.")
        sys.exit(130)
