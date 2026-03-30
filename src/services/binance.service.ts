import crypto from "crypto";
import { env } from "../config/env";
import { AppError } from "../core/errors";
import { TradeExecutionRequest } from "../core/types";
import { fetchJson } from "../lib/http";

interface BinanceExchangeInfo {
  symbols: Array<{
    symbol: string;
    filters: Array<{
      filterType: string;
      minQty?: string;
      maxQty?: string;
      stepSize?: string;
      tickSize?: string;
      minNotional?: string;
    }>;
  }>;
}

interface BinanceBookTicker {
  symbol: string;
  bidPrice: string;
  askPrice: string;
}

interface BinanceOrderResponse {
  symbol?: string;
  orderId?: number | string;
  clientOrderId?: string;
  status?: string;
  executedQty?: string;
  cummulativeQuoteQty?: string;
  fills?: Array<{
    price: string;
    qty: string;
    commission?: string;
    commissionAsset?: string;
  }>;
}

export class BinanceService {
  private exchangeInfoCache?: BinanceExchangeInfo;

  async getAccount(apiKey: string, apiSecret: string) {
    return this.signedRequest("/api/v3/account", apiKey, apiSecret);
  }

  async getExchangeInfo() {
    if (!this.exchangeInfoCache) {
      this.exchangeInfoCache = await fetchJson<BinanceExchangeInfo>(
        `${env.BINANCE_API_BASE_URL}/api/v3/exchangeInfo`
      );
    }

    return this.exchangeInfoCache;
  }

  async getBookTicker(symbol: string) {
    return fetchJson<BinanceBookTicker>(
      `${env.BINANCE_API_BASE_URL}/api/v3/ticker/bookTicker?symbol=${symbol}`
    );
  }

  async normalizeOrder(request: TradeExecutionRequest) {
    const exchangeInfo = await this.getExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((symbol) => symbol.symbol === request.symbol);
    if (!symbolInfo) {
      throw new AppError(`Binance symbol ${request.symbol} not found.`);
    }

    const lotSize = symbolInfo.filters.find((filter) => filter.filterType === "LOT_SIZE");
    const priceFilter = symbolInfo.filters.find((filter) => filter.filterType === "PRICE_FILTER");
    const minNotional = symbolInfo.filters.find((filter) => filter.filterType === "MIN_NOTIONAL");

    const stepSize = Number(lotSize?.stepSize ?? "0.00000001");
    const tickSize = Number(priceFilter?.tickSize ?? "0.00000001");
    const minQty = Number(lotSize?.minQty ?? "0");
    const minNotionalValue = Number(minNotional?.minNotional ?? "0");

    const normalizedQuantity = Math.floor(request.quantity / stepSize) * stepSize;
    const normalizedPrice =
      request.price !== undefined ? Math.floor(request.price / tickSize) * tickSize : request.price;
    const bookTicker = await this.getBookTicker(request.symbol);
    const effectivePrice = normalizedPrice ?? request.price ?? Number(bookTicker.askPrice);

    if (normalizedQuantity < minQty) {
      throw new AppError("Order quantity below Binance minimum lot size.");
    }

    if (normalizedQuantity * effectivePrice < minNotionalValue) {
      throw new AppError("Order notional below Binance minimum.");
    }

    return {
      ...request,
      quantity: Number(normalizedQuantity.toFixed(8)),
      price: normalizedPrice !== undefined ? Number(normalizedPrice.toFixed(8)) : request.price
    };
  }

  async validateSpread(symbol: string, maxSpreadPct: number) {
    const bookTicker = await this.getBookTicker(symbol);
    const bid = Number(bookTicker.bidPrice);
    const ask = Number(bookTicker.askPrice);
    const mid = (bid + ask) / 2;
    const spreadPct = ((ask - bid) / Math.max(mid, 1e-9)) * 100;

    if (spreadPct > maxSpreadPct) {
      throw new AppError(`Spread too wide for ${symbol}: ${spreadPct.toFixed(4)}%`);
    }

    return { bid, ask, spreadPct };
  }

  async placeOrder(request: TradeExecutionRequest, apiKey: string, apiSecret: string) {
    if (!request.price && request.orderType === "limit") {
      throw new AppError("Limit order requires a price");
    }

    const params = new URLSearchParams({
      symbol: request.symbol,
      side: request.side,
      type: request.orderType.toUpperCase(),
      quantity: request.quantity.toString(),
      newOrderRespType: "FULL"
    });

    if (request.clientOrderId) {
      params.set("newClientOrderId", request.clientOrderId);
    }

    if (request.orderType === "limit" && request.price) {
      params.set("timeInForce", "GTC");
      params.set("price", request.price.toString());
    }

    return this.signedRequest("/api/v3/order", apiKey, apiSecret, {
      method: "POST",
      body: params
    });
  }

  async getOrder(symbol: string, apiKey: string, apiSecret: string, orderId?: string, clientOrderId?: string) {
    const params = new URLSearchParams({ symbol });
    if (orderId) {
      params.set("orderId", orderId);
    }
    if (clientOrderId) {
      params.set("origClientOrderId", clientOrderId);
    }
    return this.signedRequest("/api/v3/order", apiKey, apiSecret, { method: "GET", body: params });
  }

  resolveExecution(order: BinanceOrderResponse, fallbackPrice?: number, fallbackQty?: number) {
    const executedQty = Number(order.executedQty ?? fallbackQty ?? 0);
    const cumulativeQuote = Number(order.cummulativeQuoteQty ?? 0);
    const fillPrice =
      order.fills && order.fills.length > 0
        ? order.fills.reduce((sum, fill) => sum + Number(fill.price) * Number(fill.qty), 0) /
          Math.max(
            order.fills.reduce((sum, fill) => sum + Number(fill.qty), 0),
            1e-9
          )
        : cumulativeQuote > 0 && executedQty > 0
          ? cumulativeQuote / executedQty
          : fallbackPrice ?? 0;

    return {
      executedQty: Number(executedQty.toFixed(8)),
      executedPrice: Number(fillPrice.toFixed(8)),
      status: order.status ?? "UNKNOWN",
      exchangeOrderId: order.orderId !== undefined ? String(order.orderId) : undefined,
      clientOrderId: order.clientOrderId
    };
  }

  private async signedRequest(
    path: string,
    apiKey: string,
    apiSecret: string,
    init?: { method?: string; body?: URLSearchParams }
  ) {
    const payload = init?.body ?? new URLSearchParams();
    payload.set("timestamp", Date.now().toString());
    const signature = crypto.createHmac("sha256", apiSecret).update(payload.toString()).digest("hex");
    payload.set("signature", signature);

    const response = await fetch(`${env.BINANCE_API_BASE_URL}${path}?${payload.toString()}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-MBX-APIKEY": apiKey
      }
    });

    if (!response.ok) {
      throw new AppError(`Binance request failed: ${await response.text()}`, response.status);
    }

    return response.json();
  }
}
