const rp = require('request-promise');
const BigNumber = require('bignumber.js');

class Trades {
  constructor(options = {}) {
    this.client = options.client;
    this.base = options.base;
    this.quote = options.quote;
    this.onReceived = options.onReceived || (() => {});
    this.onUnsubscribe = options.onUnsubscribe || (() => {});
    this.trades = [];
    this.requesting = 0;
    this.requestId = 0;
  }

  subscribe() {
    this.cable = this.client.cable.subscriptions.create({
      channel: 'TradesChannel',
      contract: this.client.system.contract.substr(2),
      token: this.base.address.substr(2),
      base: this.quote.address.substr(2)
    }, {
      connected: () => this.update(),
      received: () => {
        ++this.requestId;
        this.update();
      }
    });
  }

  unsubscribe() {
    clearTimeout(this.retryTimer);
    this.cable.unsubscribe();
    delete this.cable;
    this.onUnsubscribe();
  }

  async update() {
    if (this.requesting) {
      return;
    }
    this.requesting = this.requestId;
    clearTimeout(this.retryTimer);
    const after = this.trades.length ? this.trades[0].id : null;
    try {
      const json = await this.get(after);
      const trades = this.convert(json.trades, false);
      if (after) {
        this.trades.unshift(...trades);
      } else {
        this.trades = trades;
      }
      this.onReceived(this.trades);
      if (this.requesting !== this.requestId) {
        this.requesting = 0;
        this.update();
      } else {
        this.requesting = 0;
      }
    } catch (e) {
      console.log(e);
      this.requesting = 0;
      this.retryTimer = setTimeout(() => this.update(), 5000);
    }
  }

  convert(trades) {
    return trades.map(trade => {
      const quote = this.client.tokenManager.addressMap[`0x${trade.token_base}`],
        base = this.client.tokenManager.addressMap[`0x${trade.token_target}`],
        baseAmount = this.client.tokenManager.toAmount(base, trade.amount_target),
        quoteAmount = this.client.tokenManager.toAmount(quote, trade.amount_base);
      return {
        id: trade.id,
        side: trade.is_buy ? 'sell' : 'buy',
        price: quoteAmount.div(baseAmount).round(9).toNumber(),
        amount: baseAmount,
        pair: `${base.symbol}_${quote.symbol}`,
        timestamp: trade.timestamp
      };
    });
  }

  get(after = null) {
    return this.client.request('trades', {
      data: {
        token: this.base.address.substr(2),
        base: this.quote.address.substr(2),
        after: after
      }
    });
  }
}

module.exports = Trades;
