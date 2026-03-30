import { env } from "../config/env";
import { Kline, MarketCandidate } from "../core/types";
import { fetchJson } from "../lib/http";

interface CoinGeckoCoinMarket {
  id: string;
  symbol: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
}

type BinanceTicker = {
  symbol: string;
  quoteVolume: string;
  priceChangePercent: string;
  lastPrice: string;
};

export class MarketDataService {
  async getCandidates(limit: number, minVolumeGrowthPct: number, maxMarketCap: number) {
    const [coins, tickers] = await Promise.all([
      fetchJson<CoinGeckoCoinMarket[]>(
        `${env.COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${Math.max(
          limit * 3,
          30
        )}&page=1&sparkline=false&price_change_percentage=24h`
      ),
      fetchJson<BinanceTicker[]>(`${env.BINANCE_API_BASE_URL}/api/v3/ticker/24hr`)
    ]);

    const tradable = new Map(
      tickers
        .filter((ticker) => ticker.symbol.endsWith("USDT"))
        .map((ticker) => [ticker.symbol.replace("USDT", "").toLowerCase(), ticker])
    );

    return coins
      .filter((coin) => tradable.has(coin.symbol.toLowerCase()))
      .map<MarketCandidate>((coin) => {
        const ticker = tradable.get(coin.symbol.toLowerCase())!;
        const volumeGrowthPct =
          Number(ticker.priceChangePercent) * 0.35 +
          Math.min(120, (coin.total_volume / Math.max(coin.market_cap, 1)) * 100);

        return {
          symbol: `${coin.symbol.toUpperCase()}USDT`,
          coinId: coin.id,
          currentPrice: Number(ticker.lastPrice) || coin.current_price,
          marketCap: coin.market_cap,
          volume24h: Number(ticker.quoteVolume) || coin.total_volume,
          volumeGrowthPct,
          priceChange24h: coin.price_change_percentage_24h ?? 0,
          liquidityScore: Math.min(100, (Number(ticker.quoteVolume) / Math.max(coin.market_cap, 1)) * 1000)
        };
      })
      .filter(
        (candidate) =>
          candidate.marketCap > 0 &&
          candidate.marketCap <= maxMarketCap &&
          candidate.volumeGrowthPct >= minVolumeGrowthPct
      )
      .sort((a, b) => b.volumeGrowthPct - a.volumeGrowthPct)
      .slice(0, limit);
  }

  async getKlines(symbol: string, interval = "1h", limit = 200): Promise<Kline[]> {
    const raw = await fetchJson<Array<[number, string, string, string, string, string, number]>>(
      `${env.BINANCE_API_BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );

    return raw.map((item) => ({
      openTime: item[0],
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: item[6]
    }));
  }
}
