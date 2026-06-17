import Foundation

/// Interroga le fonti gratuite e legali e scarica i file.
/// Fonti: Project Gutenberg (Gutendex), Internet Archive, Open Library, DOAB, LibriVox.
enum BookService {

    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 25
        cfg.httpAdditionalHeaders = ["User-Agent": "CercaLibri-iOS/2.0"]
        return URLSession(configuration: cfg)
    }()

    /// Cerca in parallelo su tutte le fonti, deduplica e ordina i risultati.
    static func cerca(_ titolo: String) async -> [Libro] {
        let q = titolo.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return [] }

        async let g = gutenberg(q)
        async let a = internetArchive(q)
        async let o = openLibrary(q)
        async let d = doab(q)
        async let l = librivox(q)
        let tutti = await g + a + o + d + l
        return ordina(dedup(tutti), query: q)
    }

    /// Link pronto alla ricerca su MLOL (prestito biblioteche, serve la tessera).
    /// MLOL non ha un'API pubblica: è un suggerimento legale, non un download.
    static func urlMLOL(_ titolo: String) -> URL? {
        link("https://www.medialibrary.it/cerca?keywords=", titolo)
    }

    /// Link alla ricerca su Standard Ebooks (EPUB curati di pubblico dominio).
    /// Il download è protetto da anti-bot, quindi è un link da aprire nel browser.
    static func urlStandardEbooks(_ titolo: String) -> URL? {
        link("https://standardebooks.org/ebooks/?query=", titolo)
    }

    private static func link(_ base: String, _ titolo: String) -> URL? {
        let q = titolo.trimmingCharacters(in: .whitespacesAndNewlines)
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: base + q)
    }

    // MARK: - Project Gutenberg (Gutendex)

    private static func gutenberg(_ titolo: String) async -> [Libro] {
        guard var c = URLComponents(string: "https://gutendex.com/books") else { return [] }
        c.queryItems = [URLQueryItem(name: "search", value: titolo)]
        guard let url = c.url,
              let (data, _) = try? await session.data(from: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = root["results"] as? [[String: Any]] else { return [] }

        var libri: [Libro] = []
        for libro in results.prefix(6) {
            var formati: [String: URL] = [:]
            var cover: URL?
            if let f = libro["formats"] as? [String: String] {
                for (mime, link) in f where !link.hasSuffix(".zip") {
                    guard let u = URL(string: link) else { continue }
                    if mime.contains("image"), cover == nil { cover = u }
                    else if mime.contains("application/pdf") { formati["pdf"] = u }
                    else if mime.contains("epub") { formati["epub"] = u }
                    else if mime.hasPrefix("text/plain"), formati["txt"] == nil { formati["txt"] = u }
                }
            }
            guard !formati.isEmpty else { continue }
            let autori = libro["authors"] as? [[String: Any]]
            let autore = (autori?.first?["name"] as? String) ?? "Sconosciuto"
            let langs = libro["languages"] as? [String]
            libri.append(Libro(
                titolo: libro["title"] as? String ?? "(senza titolo)",
                autore: autore, anno: "",
                fonte: "Project Gutenberg", formati: formati,
                lingua: langs?.first ?? "", cover: cover,
                popolarita: libro["download_count"] as? Int ?? 0))
        }
        return libri
    }

    // MARK: - Internet Archive

    private static func internetArchive(_ titolo: String) async -> [Libro] {
        guard var c = URLComponents(string: "https://archive.org/advancedsearch.php") else { return [] }
        c.queryItems = [
            URLQueryItem(name: "q", value: "title:(\"\(titolo)\") AND mediatype:texts AND NOT access-restricted-item:true"),
            URLQueryItem(name: "fl[]", value: "identifier"),
            URLQueryItem(name: "fl[]", value: "title"),
            URLQueryItem(name: "fl[]", value: "creator"),
            URLQueryItem(name: "fl[]", value: "year"),
            URLQueryItem(name: "fl[]", value: "downloads"),
            URLQueryItem(name: "rows", value: "6"),
            URLQueryItem(name: "output", value: "json"),
        ]
        guard let url = c.url,
              let (data, _) = try? await session.data(from: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let resp = root["response"] as? [String: Any],
              let docs = resp["docs"] as? [[String: Any]] else { return [] }

        var libri: [Libro] = []
        for doc in docs {
            guard let ident = doc["identifier"] as? String else { continue }
            var creator = "Sconosciuto"
            if let s = doc["creator"] as? String { creator = s }
            else if let arr = doc["creator"] as? [String], let first = arr.first { creator = first }
            var formati: [String: URL] = [:]
            if let pdf = URL(string: "https://archive.org/download/\(ident)/\(ident).pdf") { formati["pdf"] = pdf }
            if let epub = URL(string: "https://archive.org/download/\(ident)/\(ident).epub") { formati["epub"] = epub }
            libri.append(Libro(
                titolo: (doc["title"] as? String) ?? ident,
                autore: creator,
                anno: doc["year"].map { "\($0)" } ?? "",
                fonte: "Internet Archive", formati: formati,
                cover: URL(string: "https://archive.org/services/img/\(ident)"),
                popolarita: doc["downloads"] as? Int ?? 0,
                archiveID: ident))
        }
        return libri
    }

    // MARK: - Open Library (ebook ad accesso pubblico)

    private static func openLibrary(_ titolo: String) async -> [Libro] {
        guard var c = URLComponents(string: "https://openlibrary.org/search.json") else { return [] }
        c.queryItems = [
            URLQueryItem(name: "q", value: titolo),
            URLQueryItem(name: "limit", value: "12"),
            URLQueryItem(name: "fields", value: "title,author_name,first_publish_year,cover_i,ia,ebook_access"),
        ]
        guard let url = c.url,
              let (data, _) = try? await session.data(from: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let docs = root["docs"] as? [[String: Any]] else { return [] }

        var libri: [Libro] = []
        for doc in docs {
            guard (doc["ebook_access"] as? String) == "public",
                  let ia = (doc["ia"] as? [String])?.first else { continue }
            var formati: [String: URL] = [:]
            if let pdf = URL(string: "https://archive.org/download/\(ia)/\(ia).pdf") { formati["pdf"] = pdf }
            if let epub = URL(string: "https://archive.org/download/\(ia)/\(ia).epub") { formati["epub"] = epub }
            let autori = doc["author_name"] as? [String]
            var cover: URL?
            if let cid = doc["cover_i"] as? Int {
                cover = URL(string: "https://covers.openlibrary.org/b/id/\(cid)-M.jpg")
            }
            libri.append(Libro(
                titolo: doc["title"] as? String ?? "(senza titolo)",
                autore: autori?.first ?? "Sconosciuto",
                anno: doc["first_publish_year"].map { "\($0)" } ?? "",
                fonte: "Open Library", formati: formati,
                cover: cover, archiveID: ia))
            if libri.count >= 6 { break }
        }
        return libri
    }

    // MARK: - DOAB (Directory of Open Access Books)

    private static func doab(_ titolo: String) async -> [Libro] {
        guard var c = URLComponents(string: "https://directory.doabooks.org/rest/search") else { return [] }
        c.queryItems = [
            URLQueryItem(name: "query", value: titolo),
            URLQueryItem(name: "expand", value: "metadata,bitstreams"),
        ]
        guard let url = c.url,
              let (data, _) = try? await session.data(from: url),
              let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }

        var libri: [Libro] = []
        for item in items.prefix(6) {
            var meta: [String: String] = [:]
            if let md = item["metadata"] as? [[String: Any]] {
                for m in md {
                    if let k = m["key"] as? String, let v = m["value"] as? String { meta[k] = v }
                }
            }
            var formati: [String: URL] = [:]
            if let bits = item["bitstreams"] as? [[String: Any]] {
                for b in bits {
                    guard let link = b["retrieveLink"] as? String,
                          let u = URL(string: "https://directory.doabooks.org" + link) else { continue }
                    let name = (b["name"] as? String ?? "").lowercased()
                    if name.hasSuffix(".pdf"), formati["pdf"] == nil { formati["pdf"] = u }
                    else if name.hasSuffix(".epub"), formati["epub"] == nil { formati["epub"] = u }
                }
            }
            guard !formati.isEmpty else { continue }
            let anno = String((meta["dc.date.issued"] ?? "").prefix(4))
            libri.append(Libro(
                titolo: meta["dc.title"] ?? (item["name"] as? String ?? "(senza titolo)"),
                autore: meta["dc.contributor.author"] ?? "Sconosciuto",
                anno: anno, fonte: "DOAB (Open Access)", formati: formati,
                lingua: meta["dc.language"] ?? ""))
        }
        return libri
    }

    // MARK: - LibriVox (audiolibri di pubblico dominio)

    private static func librivox(_ titolo: String) async -> [Libro] {
        guard var c = URLComponents(string: "https://librivox.org/api/feed/audiobooks") else { return [] }
        c.queryItems = [
            URLQueryItem(name: "title", value: "^" + titolo),
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "limit", value: "6"),
        ]
        guard let url = c.url,
              let (data, _) = try? await session.data(from: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let books = root["books"] as? [[String: Any]] else { return [] }

        var libri: [Libro] = []
        for libro in books.prefix(6) {
            guard let zip = libro["url_zip_file"] as? String,
                  let u = URL(string: zip) else { continue }
            var autore = "Sconosciuto"
            if let autori = libro["authors"] as? [[String: Any]], let a = autori.first {
                let nome = [a["first_name"] as? String, a["last_name"] as? String]
                    .compactMap { $0 }.joined(separator: " ")
                    .trimmingCharacters(in: .whitespaces)
                if !nome.isEmpty { autore = nome }
            }
            libri.append(Libro(
                titolo: libro["title"] as? String ?? "(senza titolo)",
                autore: autore, anno: "",
                fonte: "LibriVox (audiolibro MP3)", formati: ["zip": u]))
        }
        return libri
    }

    // MARK: - Deduplica e ordinamento

    private static func norm(_ s: String) -> String {
        s.lowercased().folding(options: .diacriticInsensitive, locale: nil)
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }.joined(separator: " ")
    }

    private static func dedup(_ libri: [Libro]) -> [Libro] {
        var visti: [String: Libro] = [:]
        var ordine: [String] = []
        for l in libri {
            let chiave = norm(l.titolo) + "|" + norm(l.autore)
            if var base = visti[chiave] {
                for (fmt, u) in l.formati where base.formati[fmt] == nil { base.formati[fmt] = u }
                if base.cover == nil { base.cover = l.cover }
                base.popolarita = max(base.popolarita, l.popolarita)
                visti[chiave] = base
            } else {
                visti[chiave] = l
                ordine.append(chiave)
            }
        }
        return ordine.compactMap { visti[$0] }
    }

    private static func ordina(_ libri: [Libro], query: String) -> [Libro] {
        let q = norm(query)
        func rilevanza(_ t: String) -> Int {
            if t == q { return 0 }
            if t.hasPrefix(q) { return 1 }
            if t.contains(q) { return 2 }
            return 3
        }
        return libri.sorted {
            let ra = rilevanza(norm($0.titolo)), rb = rilevanza(norm($1.titolo))
            return ra != rb ? ra < rb : $0.popolarita > $1.popolarita
        }
    }

    // MARK: - Risoluzione file reali su Internet Archive

    /// Per item Internet Archive/Open Library, legge l'elenco file effettivo
    /// (lo schema {id}/{id}.pdf non è sempre valido) e ritorna i formati reali.
    private static func formatiArchive(_ ident: String) async -> [String: URL] {
        guard let url = URL(string: "https://archive.org/metadata/\(ident)"),
              let (data, _) = try? await session.data(from: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let files = root["files"] as? [[String: Any]] else { return [:] }

        var out: [String: URL] = [:]
        let base = "https://archive.org/download/\(ident)/"
        for f in files {
            guard let name = f["name"] as? String else { continue }
            let low = name.lowercased()
            let enc = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
            guard let u = URL(string: base + enc) else { continue }
            if low.hasSuffix(".pdf"), out["pdf"] == nil { out["pdf"] = u }
            else if low.hasSuffix(".epub"), out["epub"] == nil { out["epub"] = u }
            else if low.hasSuffix("_djvu.txt"), out["txt"] == nil { out["txt"] = u }
        }
        return out
    }

    // MARK: - Download

    /// Scarica il libro nel formato preferito e restituisce l'URL locale del file.
    static func scarica(_ libro: Libro, formatoPreferito: String) async throws -> URL {
        var libro = libro
        if !libro.archiveID.isEmpty {
            let reali = await formatiArchive(libro.archiveID)
            for (fmt, u) in reali { libro.formati[fmt] = u }
        }
        guard let scelta = libro.url(preferito: formatoPreferito) else {
            throw URLError(.badURL)
        }
        let (tmp, response) = try await session.download(from: scelta.url)

        if let http = response as? HTTPURLResponse,
           let type = http.value(forHTTPHeaderField: "Content-Type")?.lowercased(),
           type.contains("html") {
            throw URLError(.cannotParseResponse) // pagina di errore, non il file
        }

        let nome = nomeFile(libro.titolo, formato: scelta.formato)
        let dest = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(nome)
        try? FileManager.default.removeItem(at: dest)
        try FileManager.default.moveItem(at: tmp, to: dest)
        return dest
    }

    private static func nomeFile(_ titolo: String, formato: String) -> String {
        let consentiti = CharacterSet.alphanumerics.union(.whitespaces)
        let pulito = String(titolo.unicodeScalars.filter { consentiti.contains($0) })
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: " ", with: "_")
        let base = pulito.isEmpty ? "libro" : String(pulito.prefix(80))
        return "\(base).\(formato)"
    }
}
