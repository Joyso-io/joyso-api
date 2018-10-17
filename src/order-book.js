const rp = require('request-promise');
const BigNumber = require('bignumber.js');

class OrderBook {
  constructor(options = {}) {
    this.client = options.client;
    this.base = options.base;
    this.quote = options.quote;
    this.onReceived = options.onReceived || (() => {});
    this.onUnsubscribe = options.onUnsubscribe || (() => {});
  }

  subscribe() {
    this.cable = this.client.cable.subscriptions.create({
      channel: 'OrdersChannel',
      contract: this.client.system.contract.substr(2),
      token: this.base.address.substr(2),
      base: this.quote.address.substr(2)
    }, {
      connected: () => this.update(),
      received: data => {
        if (!this.orderBook) {
          return;
        }
        ['buy', 'sell'].forEach(type => {
          Object.keys(data[type]).forEach(price => {
            if (data[type][price] !== '0') {
              this.orderBook[type][price] = new BigNumber(data[type][price]);
            } else {
              delete this.orderBook[type][price];
            }
          });
        });
        this.notify();
      }
    });
  }

  unsubscribe() {
    this.cable.unsubscribe();
    delete this.cable;
    this.onUnsubscribe();
  }

  async update() {
    const json = await this.get();
    ['buy', 'sell'].forEach(t => {
      Object.keys(json[t]).forEach(k => {
        json[t][k] = new BigNumber(json[t][k]);
      });
    });
    this.orderBook = json;
    this.notify();
  }

  notify() {
    const buyOrders = Object.keys(this.orderBook.buy)
      .map(key => this.convert(key, this.orderBook.buy[key])).sort((a, b) => {
        return b.price - a.price;
      });
    const sellOrders = Object.keys(this.orderBook.sell)
      .map(key => this.convert(key, this.orderBook.sell[key])).sort((a, b) => {
        return a.price - b.price;
      });

    this.onReceived({ buy: buyOrders, sell: sellOrders });
  }

  convert(key, amount) {
    const base = this.client.tokenManager.toAmount(this.base, amount);
    const price = parseFloat(key);
    return { price, amount: base };
  }

  get() {
    return this.client.request('orders', {
      data: {
        contract: this.client.system.contract.substr(2),
        token: this.base.address.substr(2),
        base: this.quote.address.substr(2)
      }
    });
  }
}

module.exports = OrderBook;
