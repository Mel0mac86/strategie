import SwiftUI
import QuickLook

@MainActor
final class RicercaViewModel: ObservableObject {
    @Published var query = ""
    @Published var formato = "pdf"
    @Published var risultati: [Libro] = []
    @Published var inCaricamento = false
    @Published var messaggio: String?
    @Published var fileScaricato: URL?
    @Published var libroInDownload: Libro.ID?

    func cerca() async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        inCaricamento = true
        messaggio = nil
        risultati = []
        risultati = await BookService.cerca(q)
        inCaricamento = false
        if risultati.isEmpty {
            messaggio = "Nessun libro gratuito trovato per «\(q)». Prova con il titolo originale o l'autore."
        }
    }

    func scarica(_ libro: Libro) async {
        libroInDownload = libro.id
        messaggio = nil
        do {
            let url = try await BookService.scarica(libro, formatoPreferito: formato)
            fileScaricato = url
        } catch {
            messaggio = "Download non riuscito. Prova un altro risultato o formato."
        }
        libroInDownload = nil
    }
}

struct ContentView: View {
    @StateObject private var vm = RicercaViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                formatoPicker
                contenuto
                mlolFooter
            }
            .navigationTitle("Cerca Libri 📚")
            .searchable(text: $vm.query, prompt: "Titolo del libro")
            .onSubmit(of: .search) { Task { await vm.cerca() } }
            .quickLookPreview($vm.fileScaricato)
        }
    }

    private var formatoPicker: some View {
        Picker("Formato", selection: $vm.formato) {
            Text("PDF").tag("pdf")
            Text("EPUB").tag("epub")
            Text("TXT").tag("txt")
        }
        .pickerStyle(.segmented)
        .padding()
    }

    /// Suggerimento legale: prestito biblioteche con MLOL (serve la tessera).
    @ViewBuilder
    private var mlolFooter: some View {
        if !vm.query.trimmingCharacters(in: .whitespaces).isEmpty,
           let url = BookService.urlMLOL(vm.query) {
            Divider()
            Link(destination: url) {
                Label("Cerchi un titolo recente? Provalo in prestito su MLOL",
                      systemImage: "building.columns")
                    .font(.footnote)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
        }
    }

    @ViewBuilder
    private var contenuto: some View {
        if vm.inCaricamento {
            Spacer()
            ProgressView("Cerco su Gutenberg, Internet Archive, Open Library, DOAB, LibriVox…")
            Spacer()
        } else if let msg = vm.messaggio, vm.risultati.isEmpty {
            Spacer()
            ContentUnavailableView("Nessun risultato", systemImage: "books.vertical", description: Text(msg))
            Spacer()
        } else if vm.risultati.isEmpty {
            Spacer()
            ContentUnavailableView(
                "Cerca un libro",
                systemImage: "magnifyingglass",
                description: Text("Scrivi un titolo e premi Invio. Solo fonti legali e gratuite."))
            Spacer()
        } else {
            List(vm.risultati) { libro in
                LibroRow(libro: libro,
                         inDownload: vm.libroInDownload == libro.id) {
                    Task { await vm.scarica(libro) }
                }
            }
            .listStyle(.plain)
            .overlay(alignment: .bottom) {
                if let msg = vm.messaggio {
                    Text(msg).font(.footnote).padding()
                        .background(.thinMaterial, in: Capsule())
                        .padding(.bottom, 8)
                }
            }
        }
    }
}

struct LibroRow: View {
    let libro: Libro
    let inDownload: Bool
    let onDownload: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            copertina
            VStack(alignment: .leading, spacing: 3) {
                Text(libro.titolo).font(.headline).lineLimit(2)
                Text(libro.autore + (libro.anno.isEmpty ? "" : " · \(libro.anno)"))
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    Text(libro.fonte)
                    if !libro.lingua.isEmpty { Text("· \(libro.lingua)") }
                    Text("·")
                    Text(libro.formatiDescrizione.uppercased())
                }
                .font(.caption).foregroundStyle(.tertiary)
            }
            Spacer()
            if inDownload {
                ProgressView()
            } else {
                Button(action: onDownload) {
                    Image(systemName: "arrow.down.circle.fill").font(.title2)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }

    /// Copertina del libro (se disponibile), con segnaposto.
    @ViewBuilder
    private var copertina: some View {
        if let url = libro.cover {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFill()
                default:
                    Image(systemName: "book.closed.fill")
                        .foregroundStyle(.tint).font(.title2)
                }
            }
            .frame(width: 40, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 4))
        } else {
            Image(systemName: "book.closed.fill")
                .foregroundStyle(.tint).font(.title2)
                .frame(width: 40, height: 56)
        }
    }
}

#Preview {
    ContentView()
}
