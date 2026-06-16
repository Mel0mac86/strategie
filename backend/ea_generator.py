"""Converte una strategia generata in un Expert Advisor MT4 (.mq4).

Produce codice MQL4 completo e compilabile con gestione del rischio FTMO
integrata (daily reset, max daily loss 5%, max overall loss 10%, lot sizing
per rischio%, time/news filter, magic number) e un blocco di segnale specifico
per ogni tipo di strategia. L'utente sceglie il tipo: sono supportati tutti.
"""
from __future__ import annotations

STRATEGY_TYPES = ["trend_pullback", "session_breakout", "xau_scalper", "mean_reversion"]


def _signal_block(stype: str) -> str:
    """Ritorna l'implementazione MQL4 di GetSignal() per il tipo di strategia."""
    blocks = {
        # ---- Trend + Pullback (EMA50/200 trend, pullback su EMA20) ----
        "trend_pullback": """
//--- Segnale: Trend + Pullback (EMA50 vs EMA200, rientro su EMA20)
int GetSignal()
{
   double ema50  = iMA(_Symbol, TrendTF, 50, 0, MODE_EMA, PRICE_CLOSE, 0);
   double ema200 = iMA(_Symbol, TrendTF, 200, 0, MODE_EMA, PRICE_CLOSE, 0);
   double ema20  = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE, 0);
   double ema20p = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE, 1);
   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   double low1   = iLow(_Symbol, PERIOD_CURRENT, 1);
   double high1  = iHigh(_Symbol, PERIOD_CURRENT, 1);

   bool upTrend   = ema50 > ema200;
   bool downTrend = ema50 < ema200;

   // Long: trend su, pullback ha toccato EMA20 e la candela ha chiuso sopra
   if(upTrend && low1 <= ema20p && close1 > ema20)
      return SIGNAL_BUY;
   // Short: trend giu, pullback su EMA20 e chiusura sotto
   if(downTrend && high1 >= ema20p && close1 < ema20)
      return SIGNAL_SELL;
   return SIGNAL_NONE;
}
""",
        # ---- Session Breakout (range asiatico, breakout Londra/NY) ----
        "session_breakout": """
//--- Segnale: Breakout di Sessione (range asiatico -> breakout)
int GetSignal()
{
   double rangeHigh = 0, rangeLow = 0;
   int bars = iBarShift(_Symbol, PERIOD_M15, StringToTime(TimeToString(TimeCurrent(), TIME_DATE) + " 07:00"));
   int startB = iBarShift(_Symbol, PERIOD_M15, StringToTime(TimeToString(TimeCurrent(), TIME_DATE) + " 00:00"));
   if(startB <= bars) return SIGNAL_NONE;
   rangeHigh = iHigh(_Symbol, PERIOD_M15, iHighest(_Symbol, PERIOD_M15, MODE_HIGH, startB-bars, bars));
   rangeLow  = iLow(_Symbol, PERIOD_M15, iLowest(_Symbol, PERIOD_M15, MODE_LOW, startB-bars, bars));

   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   double ema200 = iMA(_Symbol, TrendTF, 200, 0, MODE_EMA, PRICE_CLOSE, 0);

   // Solo breakout nella direzione del trend H4
   if(close1 > rangeHigh && Close[0] > ema200) return SIGNAL_BUY;
   if(close1 < rangeLow  && Close[0] < ema200) return SIGNAL_SELL;
   return SIGNAL_NONE;
}
""",
        # ---- XAU Scalper (EMA21 bias su M15, micro-break) ----
        "xau_scalper": """
//--- Segnale: XAU Scalper (bias EMA21 M15 + momentum)
int GetSignal()
{
   double ema21  = iMA(_Symbol, PERIOD_M15, 21, 0, MODE_EMA, PRICE_CLOSE, 0);
   double close0 = iClose(_Symbol, PERIOD_M15, 0);
   double rsi    = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE, 0);
   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   double high2  = iHigh(_Symbol, PERIOD_CURRENT, 2);
   double low2   = iLow(_Symbol, PERIOD_CURRENT, 2);

   bool biasUp   = close0 > ema21;
   bool biasDown = close0 < ema21;

   if(biasUp && close1 > high2 && rsi > 50 && rsi < 75) return SIGNAL_BUY;
   if(biasDown && close1 < low2 && rsi < 50 && rsi > 25) return SIGNAL_SELL;
   return SIGNAL_NONE;
}
""",
        # ---- Mean Reversion (Bollinger + RSI in range) ----
        "mean_reversion": """
//--- Segnale: Mean Reversion (Bollinger 20,2 + RSI in range)
int GetSignal()
{
   double adx = iADX(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE, MODE_MAIN, 0);
   if(adx >= 20) return SIGNAL_NONE; // opera solo in range

   double upper = iBands(_Symbol, PERIOD_CURRENT, 20, 2, 0, PRICE_CLOSE, MODE_UPPER, 0);
   double lower = iBands(_Symbol, PERIOD_CURRENT, 20, 2, 0, PRICE_CLOSE, MODE_LOWER, 0);
   double rsi   = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE, 0);
   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   double low1   = iLow(_Symbol, PERIOD_CURRENT, 1);
   double high1  = iHigh(_Symbol, PERIOD_CURRENT, 1);

   if(low1 <= lower && close1 > lower && rsi < 30) return SIGNAL_BUY;
   if(high1 >= upper && close1 < upper && rsi > 70) return SIGNAL_SELL;
   return SIGNAL_NONE;
}
""",
    }
    return blocks.get(stype, blocks["trend_pullback"]).strip("\n")


def generate_ea(strategy: dict, *, strategy_type: str = "trend_pullback",
                symbol: str = "EURUSD", risk_pct: float = 1.0,
                magic_number: int = 990201) -> str:
    """Genera il sorgente MQL4 completo dell'EA."""
    if strategy_type not in STRATEGY_TYPES:
        strategy_type = "trend_pullback"

    title = (strategy or {}).get("title", "FTMO Strategy")
    summary = (strategy or {}).get("summary", "")
    rm = (strategy or {}).get("risk_management", {}) or {}
    min_rr = float(rm.get("min_rr", 2.0))
    max_daily_trades = int(rm.get("max_daily_trades", 3))
    ftmo = (strategy or {}).get("ftmo", {}) or {}
    daily_loss_pct = float(ftmo.get("max_daily_loss_pct", 0.05)) * 100 if ftmo.get("max_daily_loss_pct", 0.05) <= 1 else float(ftmo.get("max_daily_loss_pct", 5))
    overall_loss_pct = float(ftmo.get("max_overall_loss_pct", 0.10)) * 100 if ftmo.get("max_overall_loss_pct", 0.10) <= 1 else float(ftmo.get("max_overall_loss_pct", 10))

    # commento header con il riepilogo della strategia
    summary_lines = "\n".join("// " + ln for ln in _wrap(summary, 78)) if summary else "//"
    entry_rules = (strategy or {}).get("entry_rules", []) or []
    rules_comment = "\n".join(f"//   {i+1}. " + " ".join(_wrap(r, 70))
                              for i, r in enumerate(entry_rules))

    signal_block = _signal_block(strategy_type)

    ea = f"""//+------------------------------------------------------------------+
//|  {title}
//|  Generato automaticamente da FTMO Strategy App
//|  Tipo strategia: {strategy_type}
//+------------------------------------------------------------------+
// {title}
//
{summary_lines}
//
// Regole di ingresso:
{rules_comment if rules_comment else "//   (vedi strategia)"}
//+------------------------------------------------------------------+
#property copyright "FTMO Strategy App"
#property version   "1.00"
#property strict

//==================  PARAMETRI  ===================================
input double RiskPercent      = {risk_pct:.2f};   // Rischio % per trade
input double MinRR            = {min_rr:.1f};      // Risk:Reward minimo (TP = SL * RR)
input double SL_ATR_Mult      = 1.5;        // Stop loss = ATR * questo moltiplicatore
input int    ATR_Period       = 14;         // Periodo ATR
input ENUM_TIMEFRAMES TrendTF = PERIOD_H4;  // Timeframe per il filtro di trend
input int    MaxDailyTrades   = {max_daily_trades};         // Numero massimo di trade al giorno
input double MaxDailyLossPct  = {daily_loss_pct:.1f};       // Stop trading se perdita giornaliera >= (FTMO 5%)
input double MaxOverallLossPct= {overall_loss_pct:.1f};      // Blocco se drawdown totale >= (FTMO 10%)
input double StopDayProfitPct = 3.0;        // Stop trading dopo +% in giornata (lock-in)
input int    StartHour        = 8;          // Ora inizio operativita' (server)
input int    EndHour          = 20;         // Ora fine operativita' (server)
input bool   UseBreakEven     = true;       // Break-even dopo +1R
input int    MagicNumber      = {magic_number};
input int    Slippage         = 30;
input int    MaxSpreadPoints  = 50;         // Salta ingressi con spread elevato

//==================  STATO  =======================================
#define SIGNAL_NONE 0
#define SIGNAL_BUY  1
#define SIGNAL_SELL 2

datetime g_dayStart      = 0;
double   g_dayStartEquity= 0;
double   g_initialBalance= 0;
int      g_tradesToday   = 0;
datetime g_lastBarTime   = 0;

//+------------------------------------------------------------------+
int OnInit()
{{
   g_initialBalance = AccountBalance();
   ResetDay();
   Print("EA avviato | Saldo iniziale: ", g_initialBalance,
         " | Max daily loss: ", DoubleToString(g_initialBalance*MaxDailyLossPct/100,2),
         " | Max overall loss: ", DoubleToString(g_initialBalance*MaxOverallLossPct/100,2));
   return(INIT_SUCCEEDED);
}}

void OnDeinit(const int reason) {{}}

//+------------------------------------------------------------------+
void ResetDay()
{{
   g_dayStart       = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   g_dayStartEquity = AccountEquity();
   g_tradesToday    = 0;
}}

//+------------------------------------------------------------------+
//|  Controllo conformita' FTMO: ritorna true se si puo' tradare      |
//+------------------------------------------------------------------+
bool RiskGuardOK()
{{
   // Reset giornaliero
   if(TimeCurrent() >= g_dayStart + 86400) ResetDay();

   double equity = AccountEquity();

   // Max overall loss (rispetto al saldo iniziale)
   double overallLoss = g_initialBalance - equity;
   if(overallLoss >= g_initialBalance * MaxOverallLossPct/100.0)
   {{
      static bool warned1=false;
      if(!warned1){{ Print("STOP: limite overall loss FTMO raggiunto."); warned1=true; }}
      return false;
   }}

   // Max daily loss (rispetto all'equity di inizio giornata)
   double dailyLoss = g_dayStartEquity - equity;
   if(dailyLoss >= g_initialBalance * MaxDailyLossPct/100.0)
      return false;

   // Lock-in: stop dopo +X% in giornata
   double dailyProfit = equity - g_dayStartEquity;
   if(dailyProfit >= g_initialBalance * StopDayProfitPct/100.0)
      return false;

   // Limite trade giornalieri
   if(g_tradesToday >= MaxDailyTrades)
      return false;

   // Finestra oraria
   int hour = TimeHour(TimeCurrent());
   if(hour < StartHour || hour >= EndHour)
      return false;

   // Spread filter
   if((Ask - Bid) / _Point > MaxSpreadPoints)
      return false;

   return true;
}}

//+------------------------------------------------------------------+
//|  Lot sizing: (capitale * risk%) / (SL_punti * tick value)         |
//+------------------------------------------------------------------+
double CalcLots(double slPoints)
{{
   double riskAmount = AccountBalance() * RiskPercent/100.0;
   double tickValue  = MarketInfo(_Symbol, MODE_TICKVALUE);
   double tickSize   = MarketInfo(_Symbol, MODE_TICKSIZE);
   if(tickSize == 0) tickSize = _Point;
   double valuePerPoint = tickValue * (_Point / tickSize);
   double lots = 0;
   if(slPoints > 0 && valuePerPoint > 0)
      lots = riskAmount / (slPoints * valuePerPoint);

   double minLot = MarketInfo(_Symbol, MODE_MINLOT);
   double maxLot = MarketInfo(_Symbol, MODE_MAXLOT);
   double step   = MarketInfo(_Symbol, MODE_LOTSTEP);
   if(step > 0) lots = MathFloor(lots/step)*step;
   lots = MathMax(minLot, MathMin(maxLot, lots));
   return NormalizeDouble(lots, 2);
}}

{signal_block}

//+------------------------------------------------------------------+
bool HasOpenPosition()
{{
   for(int i=OrdersTotal()-1; i>=0; i--)
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         if(OrderSymbol()==_Symbol && OrderMagicNumber()==MagicNumber)
            return true;
   return false;
}}

//+------------------------------------------------------------------+
void ManageBreakEven()
{{
   if(!UseBreakEven) return;
   for(int i=OrdersTotal()-1; i>=0; i--)
   {{
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol()!=_Symbol || OrderMagicNumber()!=MagicNumber) continue;
      double openP = OrderOpenPrice();
      double slDist = MathAbs(openP - OrderStopLoss());
      if(slDist<=0) continue;
      if(OrderType()==OP_BUY && (Bid-openP)>=slDist && OrderStopLoss()<openP)
         OrderModify(OrderTicket(), openP, openP, OrderTakeProfit(), 0, clrGreen);
      if(OrderType()==OP_SELL && (openP-Ask)>=slDist && OrderStopLoss()>openP)
         OrderModify(OrderTicket(), openP, openP, OrderTakeProfit(), 0, clrGreen);
   }}
}}

//+------------------------------------------------------------------+
void OpenTrade(int signal)
{{
   double atr = iATR(_Symbol, PERIOD_CURRENT, ATR_Period, 0);
   double slDist = atr * SL_ATR_Mult;
   if(slDist <= 0) return;
   double slPoints = slDist / _Point;
   double lots = CalcLots(slPoints);
   if(lots <= 0) return;

   double price, sl, tp;
   if(signal==SIGNAL_BUY)
   {{
      price = Ask;
      sl = price - slDist;
      tp = price + slDist*MinRR;
      if(OrderSend(_Symbol, OP_BUY, lots, price, Slippage, sl, tp,
                   "FTMO-EA", MagicNumber, 0, clrBlue) > 0)
         g_tradesToday++;
   }}
   else if(signal==SIGNAL_SELL)
   {{
      price = Bid;
      sl = price + slDist;
      tp = price - slDist*MinRR;
      if(OrderSend(_Symbol, OP_SELL, lots, price, Slippage, sl, tp,
                   "FTMO-EA", MagicNumber, 0, clrRed) > 0)
         g_tradesToday++;
   }}
}}

//+------------------------------------------------------------------+
void OnTick()
{{
   ManageBreakEven();

   // Una valutazione per barra
   if(g_lastBarTime == Time[0]) return;
   g_lastBarTime = Time[0];

   if(!RiskGuardOK()) return;
   if(HasOpenPosition()) return;

   int signal = GetSignal();
   if(signal != SIGNAL_NONE)
      OpenTrade(signal);
}}
//+------------------------------------------------------------------+
"""
    return ea


def _wrap(text: str, width: int) -> list[str]:
    words = (text or "").split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines or [""]
