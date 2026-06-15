# FTMO Strategy — App Mobile

App mobile (Expo / React Native) che **genera strategie di trading conformi alle
regole FTMO** e le mantiene tracciate per superare e mantenere una challenge.
Interfaccia in **italiano**, design **Swiss Brutalist** bianco/nero high-contrast
con accenti blu/verde/rosso.

Focus mercati: **Forex · Indici · Metalli** (più Crypto nel calcolatore).

## Funzionalità

| Schermata | Descrizione |
|-----------|-------------|
| **Genera** (`/`) | Generatore strategie con chip selector (dimensione conto $10k–$200k, fase 1/2/Funded, asset class, tolleranza rischio, stile). Switch **Modalità Locale (istantanea) / Modalità AI (Claude Sonnet 4.5)**. Se la chiave AI fallisce → fallback automatico sul template locale. |
| **Dettaglio strategia** (`/strategy/[id]`) | Bento-grid: hero card, Gestione del Rischio (max daily 5% / overall 10%, formula lot size in mono-font), Regole di Ingresso numerate, Routine Giornaliera (timeline), Cosa Fare / NON Fare. Pulsanti **PDF**, **Condividi**, **EA MT4**. Campo **Strategy Score** (0–100). |
| **Storico** (`/history`) | Strategie salvate automaticamente, pull-to-refresh, eliminazione. |
| **Lot Size** (`/calculator`) | Calcolatore standalone in tempo reale: `Capitale × Risk% / (SL × pip value)`. Risultato in lotti + USD + micro lotti. Chip asset Forex/Indici/Metalli/Crypto. |
| **Journal** (`/journal`) | Registrazione trade (asset, direzione, entry/exit, P&L, R-multiple, note) via bottom-sheet. Stats strip: trade totali, win rate, P&L cumulato, avg R, profit factor. |
| **Dashboard** (`/dashboard`) | Tracking live challenge: saldo, progresso verso target (progress bar %), Max Daily/Overall Loss, drawdown con codice colore (verde <4% / giallo 4–7% / rosso >7%). |
| **Checklist** (`/checklist`) | 12 voci pre-trading FTMO, persistenza locale per giorno, reset automatico a mezzanotte, header verde "PRONTO PER TRADARE" a 12/12. |

### Da strategia a Expert Advisor MT4
Dal dettaglio di una strategia, il pulsante **EA MT4** apre un modal in cui l'utente
**sceglie il tipo di strategia** (sono supportati tutti) e genera un file **`.mq4`
pronto per MetaTrader 4** con gestione del rischio FTMO integrata:

- Max daily loss 5% e max overall loss 10% con blocco operatività automatico
- Lot sizing automatico per rischio % (tick value reale del broker)
- Reset giornaliero, limite trade/giorno, finestra oraria, filtro spread
- Stop loss/Take profit basati su ATR, break-even dopo +1R, magic number

Tipi di strategia supportati: `trend_pullback`, `session_breakout`, `xau_scalper`,
`mean_reversion`.

## Architettura

```
strategie/
├── backend/                 FastAPI + (MongoDB | store in-memory di fallback)
│   ├── server.py            endpoint /api/*
│   ├── ftmo.py              calcoli FTMO (limiti, lot size, progressi, stats)
│   ├── ai_generator.py      generazione AI (Emergent LLM) + template locale
│   ├── ea_generator.py      generatore EA .mq4 multi-strategia
│   ├── models.py · db.py    modelli Pydantic e accesso dati
│   └── requirements.txt
└── frontend/                Expo (expo-router, TypeScript)
    ├── app/                 schermate (tabs + stack)
    └── src/                 theme, api client, componenti UI, utils
```

### API principali (`/api`)
`POST /strategy/generate` · `GET /strategy` · `GET /strategy/{id}` ·
`DELETE /strategy/{id}` · `PATCH /strategy/{id}/score` · `POST /strategy/ea` ·
`POST /lot-size` · `GET/POST/DELETE /trades` · `GET /trades/stats` ·
`GET/POST /challenge`

## Avvio

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env       # opzionale: MONGO_URL, EMERGENT_LLM_KEY
python server.py           # http://localhost:8000
```
> Senza `MONGO_URL` il backend usa uno store in-memory (solo sviluppo).
> Senza `EMERGENT_LLM_KEY` la generazione usa il template locale.

### Frontend
```bash
cd frontend
npm install
# imposta l'URL del backend (default http://localhost:8000):
EXPO_PUBLIC_API_URL=http://localhost:8000 npm run web   # oppure: npm start
```

## Note
- I calcoli FTMO (5% daily, 10% overall, target 10%/5%/nessuno) sono pre-computati
  e validati lato backend, non delegati all'AI.
- Idea di crescita: condivisione strategia come testo/PDF per passaparola tra trader
  FTMO, con possibile monetizzazione via affiliate link.
