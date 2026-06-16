/**
 * Generatore EA MT4 (.mq4) lato client — port del backend ea_generator.py.
 * Permette di esportare l'Expert Advisor direttamente dall'iPhone (PWA) senza backend.
 * Supporta tutti i tipi di strategia: l'utente sceglie.
 */
import type { Strategy } from "@/api";

export const EA_STRATEGY_TYPES = [
  "trend_pullback",
  "session_breakout",
  "xau_scalper",
  "mean_reversion",
] as const;

function signalBlock(stype: string): string {
  const blocks: Record<string, string> = {
    trend_pullback: `
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
   if(upTrend && low1 <= ema20p && close1 > ema20)
      return SIGNAL_BUY;
   if(downTrend && high1 >= ema20p && close1 < ema20)
      return SIGNAL_SELL;
   return SIGNAL_NONE;
}`,
    session_breakout: `
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
   if(close1 > rangeHigh && Close[0] > ema200) return SIGNAL_BUY;
   if(close1 < rangeLow  && Close[0] < ema200) return SIGNAL_SELL;
   return SIGNAL_NONE;
}`,
    xau_scalper: `
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
}`,
    mean_reversion: `
//--- Segnale: Mean Reversion (Bollinger 20,2 + RSI in range)
int GetSignal()
{
   double adx = iADX(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE, MODE_MAIN, 0);
   if(adx >= 20) return SIGNAL_NONE;
   double upper = iBands(_Symbol, PERIOD_CURRENT, 20, 2, 0, PRICE_CLOSE, MODE_UPPER, 0);
   double lower = iBands(_Symbol, PERIOD_CURRENT, 20, 2, 0, PRICE_CLOSE, MODE_LOWER, 0);
   double rsi   = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE, 0);
   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   double low1   = iLow(_Symbol, PERIOD_CURRENT, 1);
   double high1  = iHigh(_Symbol, PERIOD_CURRENT, 1);
   if(low1 <= lower && close1 > lower && rsi < 30) return SIGNAL_BUY;
   if(high1 >= upper && close1 < upper && rsi > 70) return SIGNAL_SELL;
   return SIGNAL_NONE;
}`,
  };
  return (blocks[stype] || blocks.trend_pullback).trim();
}

function wrap(text: string, width: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

const TREND_TF: Record<string, string> = {
  M5: "PERIOD_M30", M15: "PERIOD_H1", M30: "PERIOD_H4",
  H1: "PERIOD_H4", H4: "PERIOD_D1", D1: "PERIOD_W1",
};

export function generateEa(
  strategy: Strategy,
  opts: { strategy_type?: string; symbol?: string; risk_pct?: number; magic_number?: number; timeframe?: string } = {}
): string {
  let stype = opts.strategy_type || "trend_pullback";
  if (!EA_STRATEGY_TYPES.includes(stype as any)) stype = "trend_pullback";
  const symbol = opts.symbol || "EURUSD";
  const riskPct = opts.risk_pct ?? 1.0;
  const magic = opts.magic_number ?? 990201;
  const tf = (opts.timeframe || (strategy?.request?.timeframe as string) || "H1").toUpperCase();
  const trendTf = TREND_TF[tf] || "PERIOD_H4";

  const title = strategy?.title || "FTMO Strategy";
  const summary = strategy?.summary || "";
  const rm = strategy?.risk_management || ({} as any);
  const minRr = Number(rm.min_rr ?? 2.0);
  const maxDailyTrades = Number(rm.max_daily_trades ?? 3);

  const summaryLines = summary
    ? wrap(summary, 78).map((l) => "// " + l).join("\n")
    : "//";
  const entryRules = strategy?.entry_rules || [];
  const rulesComment = entryRules
    .map((r, i) => `//   ${i + 1}. ` + wrap(r, 70).join(" "))
    .join("\n");
  const signal = signalBlock(stype);

  return `//+------------------------------------------------------------------+
//|  ${title}
//|  Generato automaticamente da FTMO Strategy App
//|  Tipo strategia: ${stype}
//|  Timeframe operativo consigliato: ${tf} (applica l'EA a un grafico ${symbol} ${tf})
//+------------------------------------------------------------------+
// ${title}
//
${summaryLines}
//
// Regole di ingresso:
${rulesComment || "//   (vedi strategia)"}
//+------------------------------------------------------------------+
#property copyright "FTMO Strategy App"
#property version   "1.00"
#property strict

//==================  PARAMETRI  ===================================
input double RiskPercent      = ${riskPct.toFixed(2)};   // Rischio % per trade
input double MinRR            = ${minRr.toFixed(1)};      // Risk:Reward minimo (TP = SL * RR)
input double SL_ATR_Mult      = 1.5;        // Stop loss = ATR * questo moltiplicatore
input int    ATR_Period       = 14;         // Periodo ATR
input ENUM_TIMEFRAMES TrendTF = ${trendTf};  // Timeframe per il filtro di trend (op. ${tf})
input int    MaxDailyTrades   = ${maxDailyTrades};         // Numero massimo di trade al giorno
input double MaxDailyLossPct  = 5.0;        // Stop trading se perdita giornaliera >= (FTMO 5%)
input double MaxOverallLossPct= 10.0;       // Blocco se drawdown totale >= (FTMO 10%)
input double StopDayProfitPct = 3.0;        // Stop trading dopo +% in giornata (lock-in)
input int    StartHour        = 8;          // Ora inizio operativita' (server)
input int    EndHour          = 20;         // Ora fine operativita' (server)
input bool   UseBreakEven     = true;       // Break-even dopo +1R
input int    MagicNumber      = ${magic};
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
{
   g_initialBalance = AccountBalance();
   ResetDay();
   Print("EA avviato | Saldo iniziale: ", g_initialBalance);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {}

void ResetDay()
{
   g_dayStart       = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   g_dayStartEquity = AccountEquity();
   g_tradesToday    = 0;
}

//+------------------------------------------------------------------+
//|  Controllo conformita' FTMO: ritorna true se si puo' tradare      |
//+------------------------------------------------------------------+
bool RiskGuardOK()
{
   if(TimeCurrent() >= g_dayStart + 86400) ResetDay();
   double equity = AccountEquity();
   double overallLoss = g_initialBalance - equity;
   if(overallLoss >= g_initialBalance * MaxOverallLossPct/100.0)
   {
      static bool warned1=false;
      if(!warned1){ Print("STOP: limite overall loss FTMO raggiunto."); warned1=true; }
      return false;
   }
   double dailyLoss = g_dayStartEquity - equity;
   if(dailyLoss >= g_initialBalance * MaxDailyLossPct/100.0)
      return false;
   double dailyProfit = equity - g_dayStartEquity;
   if(dailyProfit >= g_initialBalance * StopDayProfitPct/100.0)
      return false;
   if(g_tradesToday >= MaxDailyTrades)
      return false;
   int hour = TimeHour(TimeCurrent());
   if(hour < StartHour || hour >= EndHour)
      return false;
   if((Ask - Bid) / _Point > MaxSpreadPoints)
      return false;
   return true;
}

//+------------------------------------------------------------------+
//|  Lot sizing: (capitale * risk%) / (SL_punti * value per point)    |
//+------------------------------------------------------------------+
double CalcLots(double slPoints)
{
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
}

${signal}

//+------------------------------------------------------------------+
bool HasOpenPosition()
{
   for(int i=OrdersTotal()-1; i>=0; i--)
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         if(OrderSymbol()==_Symbol && OrderMagicNumber()==MagicNumber)
            return true;
   return false;
}

void ManageBreakEven()
{
   if(!UseBreakEven) return;
   for(int i=OrdersTotal()-1; i>=0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol()!=_Symbol || OrderMagicNumber()!=MagicNumber) continue;
      double openP = OrderOpenPrice();
      double slDist = MathAbs(openP - OrderStopLoss());
      if(slDist<=0) continue;
      if(OrderType()==OP_BUY && (Bid-openP)>=slDist && OrderStopLoss()<openP)
         OrderModify(OrderTicket(), openP, openP, OrderTakeProfit(), 0, clrGreen);
      if(OrderType()==OP_SELL && (openP-Ask)>=slDist && OrderStopLoss()>openP)
         OrderModify(OrderTicket(), openP, openP, OrderTakeProfit(), 0, clrGreen);
   }
}

void OpenTrade(int signal)
{
   double atr = iATR(_Symbol, PERIOD_CURRENT, ATR_Period, 0);
   double slDist = atr * SL_ATR_Mult;
   if(slDist <= 0) return;
   double slPoints = slDist / _Point;
   double lots = CalcLots(slPoints);
   if(lots <= 0) return;
   double price, sl, tp;
   if(signal==SIGNAL_BUY)
   {
      price = Ask; sl = price - slDist; tp = price + slDist*MinRR;
      if(OrderSend(_Symbol, OP_BUY, lots, price, Slippage, sl, tp, "FTMO-EA", MagicNumber, 0, clrBlue) > 0)
         g_tradesToday++;
   }
   else if(signal==SIGNAL_SELL)
   {
      price = Bid; sl = price + slDist; tp = price - slDist*MinRR;
      if(OrderSend(_Symbol, OP_SELL, lots, price, Slippage, sl, tp, "FTMO-EA", MagicNumber, 0, clrRed) > 0)
         g_tradesToday++;
   }
}

//+------------------------------------------------------------------+
void OnTick()
{
   ManageBreakEven();
   if(g_lastBarTime == Time[0]) return;
   g_lastBarTime = Time[0];
   if(!RiskGuardOK()) return;
   if(HasOpenPosition()) return;
   int signal = GetSignal();
   if(signal != SIGNAL_NONE)
      OpenTrade(signal);
}
//+------------------------------------------------------------------+
`;
}
