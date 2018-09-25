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
  }

  subscribe() {
    this.cable = this.client.cable.subscriptions.create({
      channel: 'TradesChannel',
      contract: this.client.system.contract.substr(2),
      base: this.base.address.substr(2),
      token: this.quote.address.substr(2)
    }, {
      connected: () => this.update(),
      received: () => this.update()
    });
  }

  unsubscribe() {
    this.cable.unsubscribe();
    delete this.cable;
    this.onUnsubscribe();
  }

  async update() {
    const after = this.trades.length ? this.trades[0].id : null;
    const json = await this.get(after);
    const trades = this.convert(json.trades, false);
    if (after) {
      this.trades.unshift(...trades);
    } else {
      this.trades = trades;
    }
    this.onReceived(this.trades);
  }

  convert(trades) {
    return trades.map(trade => {
      const base = this.client.tokenManager.addressMap[`0x${trade.token_base}`],
        quote = this.client.tokenManager.addressMap[`0x${trade.token_target}`],
        baseAmount = this.client.tokenManager.toAmount(base, trade.amount_base),
        quoteAmount = this.client.tokenManager.toAmount(quote, trade.amount_target);
      return {
        id: trade.id,
        side: trade.is_buy ? 'sell' : 'buy',
        price: baseAmount.div(quoteAmount).round(9).toNumber(),
        amount: quoteAmount,
        pair: `${base.symbol}_${quote.symbol}`
      };
    });
  }

  get(after = null) {
    return rp(this.client.createRequest('trades', {
      qs: {
        base: this.base.address.substr(2),
        token: this.quote.address.substr(2),
        after: after
      }
    }));
  }
}

module.exports = Trades;
