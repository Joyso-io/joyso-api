const rp = require('request-promise');
const BigNumber = require('bignumber.js');
const _ = require('lodash');

const STATUS = ['pending', 'processing', 'done', 'failed', 'cancelled'];

class MyTrades {
  constructor(options = {}) {
    this.client = options.client;
    this.address = options.address;
    this.onReceived = (() => {});
    this.trades = [];
    this.requesting = 0;
    this.requestId = 0;
  }

  subscribe() {
    this.cable = this.client.cable.subscriptions.create({
      channel: 'MyTradesChannel',
      user: this.address.substr(2)
    }, {
      connected: () => {
        const index = _.findLastIndex(this.trades, trade => {
          return trade.status !== 'done';
        });
        if (index !== -1) {
          this.trades = this.trades.slice(index + 1);
        }
        this.update();
      },
      received: data => {
        switch (data.e) {
          case 'new':
            ++this.requestId;
            return this.update();
          case 'update':
            const trade = this.trades.find(t => t.id === data.data.id);
            if (trade) {
              trade.status = STATUS[data.data.status];
              if (data.data.tx_hash) {
                trade.txHash = `0x${data.data.tx_hash}`;
              }
              this.onReceived(this.trades);
            } else {
              this.update();
            }
            break;
        }
      }
    });
  }

  unsubscribe() {
    this.cable.unsubscribe();
    delete this.cable;
    this.balances = {};
  }

  async update() {
    if (this.requesting) {
      return;
    }
    this.requesting = this.requestId;
    const after = this.trades.length ? this.trades[0].id : null;
    const json = await this.get(after);
    const trades = this.convert(json.trades, true);
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
  }

  convert(trades) {
    return trades.map(trade => {
      const quote = this.client.tokenManager.addressMap[`0x${trade.token_base}`],
        base = this.client.tokenManager.addressMap[`0x${trade.token_target}`],
        tokenFee = this.client.tokenManager.addressMap[`0x${trade.token_fee}`],
        baseAmount = this.client.tokenManager.toAmount(base, trade.amount_target),
        quoteAmount = this.client.tokenManager.toAmount(quote, trade.amount_base),
        gasFee = this.client.tokenManager.toAmount(tokenFee, trade.gas_fee),
        txFee = this.client.tokenManager.toAmount(tokenFee, trade.tx_fee);
      return {
        id: trade.id,
        status: STATUS[trade.status],
        txHash: trade.tx_hash ? `0x${trade.tx_hash}` : null,
        side: trade.is_buy ? 'sell' : 'buy',
        price: quoteAmount.div(baseAmount).round(9).toNumber(),
        amount: baseAmount,
        pair: `${base.symbol}_${quote.symbol}`,
        fee: tokenFee.symbol,
        gasFee: gasFee,
        txFee: txFee,
        timestamp: trade.timestamp
      };
    });
  }

  get(after = null) {
    return rp(this.client.createRequest('trades/mine', {
      qs: {
        user: this.address.substr(2),
        after: after
      }
    }));
  }
}

module.exports = MyTrades;
