const rp = require('request-promise');
const BigNumber = require('bignumber.js');

const STATUS = ['active', 'partial', 'complete', 'cancelled'];

class Orders {
  constructor(options = {}) {
    this.client = options.client;
    this.address = options.address;
    this.onReceived = (() => {});
    this.orders = [];
  }

  subscribe() {
    this.cable = this.client.cable.subscriptions.create({
      channel: 'MyOrdersChannel',
      contract: this.client.system.contract.substr(2),
      user: this.address.substr(2)
    }, {
      connected: () => {
        this.orders = [];
        this.update();
      },
      received: data => {
        switch (data.e) {
          case 'new':
            return this.update();
          case 'update':
            const order = this.orders.find(t => t.id === data.data.id);
            if (order) {
              if (data.data.status !== 0 && data.data.status !== 1) {
                this.orders = this.orders.filter(o => o.id !== order.id);
              } else {
                const [base, quote] = this.client.tokenManager.getPair(order.pair);
                order.fill = this.client.tokenManager.toAmount(quote, data.data.amount_fill);
                order.status = STATUS[data.data.status];
              }
              this.onReceived(this.orders);
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
    const after = this.orders.length ? this.orders[0].id : null;
    const result = await this.get(after);
    const orders = this.convert(result.orders);
    if (after) {
      this.orders.unshift(...orders);
    } else {
      this.orders = orders;
    }
    this.onReceived(this.orders);
  }

  convert(orders) {
    return orders.map(o => {
      const tokenSell = this.client.tokenManager.addressMap[`0x${o.token_sell}`],
        tokenBuy = this.client.tokenManager.addressMap[`0x${o.token_buy}`],
        amountSell = this.client.tokenManager.toAmount(tokenSell, o.amount_sell),
        amountBuy = this.client.tokenManager.toAmount(tokenBuy, o.amount_buy);
      const [base, quote] = o.is_buy ? [tokenSell, tokenBuy] : [tokenBuy, tokenSell];
      return {
        id: o.id,
        status: STATUS[o.status],
        side: o.is_buy ? 'buy' : 'sell',
        price: (o.is_buy ? amountSell.div(amountBuy) : amountBuy.div(amountSell)).round(9).toNumber(),
        amount: o.is_buy ? amountBuy : amountSell,
        fill: this.client.tokenManager.toAmount(quote, o.amount_fill),
        pair: `${base.symbol}_${quote.symbol}`
      };
    });
  }

  get(after = null) {
    return rp(this.client.createRequest('orders/mine', {
      qs: {
        contract: this.client.system.contract.substr(2),
        user: this.address.substr(2),
        after: after
      }
    }));
  }
}

module.exports = Orders;
