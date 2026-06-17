import Foundation

/// Interroga le fonti gratuite e legali e scarica i file.
/// Fonti: Project Gutenberg (Gutendex), Internet Archive, DOAB.
enum BookService {

    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 25
        cfg.httpAdditionalHeaders = ["User-Agent": "CercaLibri-iOS/1.0"]
        return URLSession(configuration: cfg)
    }()

    /// Cerca in parallelo su tutte le fonti e restituisce i risultati uniti.
    static func cerca(_ titolo: String) async -> [Libro] {
        let q = titolo.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return [] }

        async let g = gutenberg(q)
        async let a = internetArchive(q)
        async let d = doab(q)
        return await g + a + d
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
            if let f = libro["formats"] as? [String: String] {
                for (mime, link) in f where !link.hasSuffix(".zip") {
                    guard let u = URL(string: link) else { continue }
                    if mime.contains("application/pdf") { formati["pdf"] = u }
                    else if mime.contains("epub") { formati["epub"] = u }
                    else if mime.hasPrefix("text/plain"), formati["txt"] == nil { formati["txt"] = u }
                }
            }
            guard !formati.isEmpty else { continue }
            let autori = libro["authors"] as? [[String: Any]]
            let autore = (autori?.first?["name"] as? String) ?? "Sconosciuto"
            libri.append(Libro(
                titolo: libro["title"] as? String ?? "(senza titolo)",
                autore: autore, anno: "",
                fonte: "Project Gutenberg", formati: formati))
        }
        return libri
    }

    // MARK: - Internet Archive

    private static func internetArchive(_ titolo: String) async -> [Libro] {
        guard var c = URLComponents(string: "https://archive.org/advancedsearch.php") else { return [] }
        c.queryItems = [
            URLQueryItem(name: "q", value: "title:(\"\(titolo)\") AND mediatype:texts"),
            URLQueryItem(name: "fl[]", value: "identifier"),
            URLQueryItem(name: "fl[]", value: "title"),
            URLQueryItem(name: "fl[]", value: "creator"),
            URLQueryItem(name: "fl[]", value: "year"),
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
                fonte: "Internet Archive", formati: formati))
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
                anno: anno, fonte: "DOAB (Open Access)", formati: formati))
        }
        return libri
    }

    // MARK: - Download

    /// Scarica il libro nel formato preferito e restituisce l'URL locale del file.
    static func scarica(_ libro: Libro, formatoPreferito: String) async throws -> URL {
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
