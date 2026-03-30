import { Kline, TechnicalIndicators } from "../core/types";

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ema(values: number[], period: number) {
  if (values.length === 0) {
    return 0;
  }

  const multiplier = 2 / (period + 1);
  let current = values[0];
  for (let index = 1; index < values.length; index += 1) {
    current = (values[index] - current) * multiplier + current;
  }
  return current;
}

function rsi(values: number[], period: number) {
  if (values.length <= period) {
    return 50;
  }

  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atrPct(klines: Kline[], period: number) {
  if (klines.length <= period) {
    return 0;
  }

  const trs: number[] = [];
  for (let index = 1; index < klines.length; index += 1) {
    const current = klines[index];
    const previous = klines[index - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
    trs.push(tr);
  }

  const atr = average(trs.slice(-period));
  return (atr / Math.max(klines.at(-1)?.close ?? 1, 1e-9)) * 100;
}

function vwap(klines: Kline[]) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of klines) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typical * candle.volume;
    cumulativeVolume += candle.volume;
  }

  return cumulativeVolume === 0 ? klines.at(-1)?.close ?? 0 : cumulativePriceVolume / cumulativeVolume;
}

function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = fast - slow;
  const signal = ema([...values.slice(-35, -1), line], 9);
  return {
    line,
    signal,
    histogram: line - signal
  };
}

export class TechnicalIndicatorsService {
  analyze(klines: Kline[], timeframe: string): TechnicalIndicators {
    const closes = klines.map((candle) => candle.close);
    const current = closes.at(-1) ?? 0;
    const macdData = macd(closes);

    return {
      timeframe,
      ema9: Number(ema(closes, 9).toFixed(6)),
      ema21: Number(ema(closes, 21).toFixed(6)),
      ema50: Number(ema(closes, 50).toFixed(6)),
      rsi14: Number(rsi(closes, 14).toFixed(2)),
      atr14Pct: Number(atrPct(klines, 14).toFixed(2)),
      vwap: Number(vwap(klines).toFixed(6)),
      macd: Number(macdData.line.toFixed(6)),
      macdSignal: Number(macdData.signal.toFixed(6)),
      macdHistogram: Number(macdData.histogram.toFixed(6))
    };
  }

  isBullish(technicals: TechnicalIndicators, currentPrice: number) {
    return (
      technicals.ema9 > technicals.ema21 &&
      technicals.ema21 >= technicals.ema50 &&
      technicals.rsi14 >= 52 &&
      technicals.rsi14 <= 72 &&
      technicals.macdHistogram >= 0 &&
      currentPrice >= technicals.vwap
    );
  }

  isBearish(technicals: TechnicalIndicators, currentPrice: number) {
    return (
      technicals.ema9 < technicals.ema21 &&
      technicals.ema21 <= technicals.ema50 &&
      technicals.rsi14 <= 48 &&
      technicals.macdHistogram <= 0 &&
      currentPrice <= technicals.vwap
    );
  }
}
