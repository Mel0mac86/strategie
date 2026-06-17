import Foundation

/// Un libro trovato su una delle fonti gratuite.
struct Libro: Identifiable, Hashable {
    let id = UUID()
    let titolo: String
    let autore: String
    let anno: String
    let fonte: String
    /// formato ("pdf", "epub", "txt") -> URL di download
    let formati: [String: URL]

    /// Sceglie l'URL nel formato preferito, con fallback sensato.
    func url(preferito: String) -> (formato: String, url: URL)? {
        let ordine = [preferito, "pdf", "epub", "txt"]
        for f in ordine {
            if let u = formati[f] { return (f, u) }
        }
        if let primo = formati.first { return (primo.key, primo.value) }
        return nil
    }

    var formatiDescrizione: String {
        formati.keys.sorted().joined(separator: ", ")
    }
}
