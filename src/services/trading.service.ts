import { query } from "../db/postgres";
import { TradeExecutionRequest } from "../core/types";
import { BinanceService } from "./binance.service";
import { CredentialsService } from "./credentials.service";
import { PortfolioService } from "./portfolio.service";
import crypto from "crypto";

export class TradingService {
  constructor(
    private readonly binanceService: BinanceService,
    private readonly credentialsService: CredentialsService,
    private readonly portfolioService: PortfolioService
  ) {}

  async execute(request: TradeExecutionRequest) {
    const normalizedRequest = await this.binanceService.normalizeOrder({
      ...request,
      clientOrderId:
        request.clientOrderId ?? `cbot_${request.userId.slice(0, 8)}_${crypto.randomBytes(6).toString("hex")}`
    });
    let exchangeOrderId: string | undefined;
    let exchangeStatus = normalizedRequest.mode === "real" ? "NEW" : "FILLED";
    let executedPrice = normalizedRequest.price ?? 0;
    let executedQuantity = normalizedRequest.quantity;
    let clientOrderId = normalizedRequest.clientOrderId;

    if (normalizedRequest.maxSpreadPct !== undefined) {
      await this.binanceService.validateSpread(normalizedRequest.symbol, normalizedRequest.maxSpreadPct);
    }

    if (normalizedRequest.mode === "real") {
      const credentials = await this.credentialsService.getCredential(request.userId, "binance");
      if (!credentials?.apiSecret) {
        throw new Error("Binance credentials are not configured for real mode.");
      }

      const response = await this.binanceService.placeOrder(
        normalizedRequest,
        credentials.apiKey,
        credentials.apiSecret
      );
      const reconciled = this.binanceService.resolveExecution(
        response,
        normalizedRequest.price,
        normalizedRequest.quantity
      );
      exchangeOrderId = reconciled.exchangeOrderId;
      clientOrderId = reconciled.clientOrderId ?? clientOrderId;
      exchangeStatus = reconciled.status;
      executedPrice = reconciled.executedPrice;
      executedQuantity = reconciled.executedQty;

      if (exchangeStatus !== "FILLED" && (exchangeOrderId || clientOrderId)) {
        const order = await this.binanceService.getOrder(
          normalizedRequest.symbol,
          credentials.apiKey,
          credentials.apiSecret,
          exchangeOrderId,
          clientOrderId
        );
        const finalExecution = this.binanceService.resolveExecution(
          order,
          normalizedRequest.price,
          normalizedRequest.quantity
        );
        exchangeOrderId = finalExecution.exchangeOrderId ?? exchangeOrderId;
        clientOrderId = finalExecution.clientOrderId ?? clientOrderId;
        exchangeStatus = finalExecution.status;
        executedPrice = finalExecution.executedPrice;
        executedQuantity = finalExecution.executedQty;
      }
    } else {
      exchangeOrderId = clientOrderId;
    }

    await query(
      `INSERT INTO trade_orders (
         user_id, symbol, side, order_type, mode, quantity, price, status, ai_signal, ai_confidence, rationale,
         exchange_order_id, client_order_id, executed_price, executed_quantity, exchange_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        normalizedRequest.userId,
        normalizedRequest.symbol,
        normalizedRequest.side,
        normalizedRequest.orderType,
        normalizedRequest.mode,
        normalizedRequest.quantity,
        normalizedRequest.price ?? null,
        exchangeStatus === "UNKNOWN" ? "FILLED" : exchangeStatus,
        normalizedRequest.aiSignal?.action ?? null,
        normalizedRequest.aiSignal?.confidence ?? 0,
        normalizedRequest.aiSignal?.summary ?? null,
        exchangeOrderId ?? null,
        clientOrderId ?? null,
        executedPrice || normalizedRequest.price || null,
        executedQuantity,
        exchangeStatus
      ]
    );

    if (normalizedRequest.side === "BUY" && executedQuantity > 0) {
      await query(
        `INSERT INTO positions (
           user_id, symbol, side, mode, quantity, entry_price, current_price, stop_loss_price, take_profit_price,
           peak_price, ai_confidence, rationale
         ) VALUES ($1, $2, 'LONG', $3, $4, $5, $5, $5, $6, $7, $8, $9)`,
        [
          normalizedRequest.userId,
          normalizedRequest.symbol,
          normalizedRequest.mode,
          executedQuantity,
          executedPrice,
          normalizedRequest.aiSignal?.stopLossPrice ?? executedPrice * 0.95,
          normalizedRequest.aiSignal?.takeProfitPrice ?? executedPrice * 1.1,
          normalizedRequest.aiSignal?.confidence ?? 0,
          normalizedRequest.aiSignal?.summary ?? null
        ]
      );

      await this.portfolioService.adjustCashBalance(
        normalizedRequest.userId,
        -(executedQuantity * executedPrice)
      );
    }

    return { exchangeOrderId, clientOrderId, exchangeStatus, executedPrice, executedQuantity };
  }

  async closePosition(input: {
    userId: string;
    positionId: string;
    exitPrice: number;
  }) {
    const [position] = await query<{
      symbol: string;
      mode: string;
      quantity: string;
      entry_price: string;
      current_price: string;
    }>(
      `SELECT symbol, mode, quantity, entry_price, current_price
       FROM positions
       WHERE id = $1 AND user_id = $2 AND status = 'OPEN'`,
      [input.positionId, input.userId]
    );

    if (!position) {
      return null;
    }

    const quantity = Number(position.quantity);
    const entryPrice = Number(position.entry_price);
    let exitPrice = input.exitPrice;

    if (position.mode === "real") {
      const credentials = await this.credentialsService.getCredential(input.userId, "binance");
      if (!credentials?.apiSecret) {
        throw new Error("Binance credentials are not configured for real mode.");
      }

      const sellRequest = await this.binanceService.normalizeOrder({
        userId: input.userId,
        symbol: position.symbol,
        orderType: "market",
        side: "SELL",
        quantity,
        price: Number(position.current_price),
        mode: "real"
      });
      const response = await this.binanceService.placeOrder(
        sellRequest,
        credentials.apiKey,
        credentials.apiSecret
      );
      const execution = this.binanceService.resolveExecution(response, input.exitPrice, quantity);
      exitPrice = execution.executedPrice || input.exitPrice;

      await query(
        `INSERT INTO trade_orders (
           user_id, symbol, side, order_type, mode, quantity, price, status, exchange_order_id, client_order_id,
           executed_price, executed_quantity, exchange_status
         ) VALUES ($1, $2, 'SELL', 'market', 'real', $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.userId,
          position.symbol,
          execution.executedQty || quantity,
          exitPrice,
          execution.status,
          execution.exchangeOrderId ?? null,
          execution.clientOrderId ?? null,
          exitPrice,
          execution.executedQty || quantity,
          execution.status
        ]
      );
    }

    const pnl = (exitPrice - entryPrice) * quantity;

    await query(
      `UPDATE positions
       SET status = 'CLOSED',
           current_price = $3,
           realized_pnl = $4,
           closed_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [input.positionId, input.userId, exitPrice, pnl]
    );

    await this.portfolioService.adjustCashBalance(input.userId, quantity * exitPrice);
    return { pnl };
  }
}
