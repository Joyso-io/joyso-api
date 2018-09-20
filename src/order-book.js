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
      base: this.base.address.substr(2),
      token: this.quote.address.substr(2)
    }, {
      connected: () => this.updateOrders(),
      received: data => {
        ['buy', 'sell'].forEach(type => {
          Object.keys(data[type]).forEach(price => {
            if (data[type][price] !== '0') {
              this.orderBook[type][price] = new BigNumber(data[type][price]);
            } else {
              delete this.orderBook[type][price];
            }
          });
        });
        this.updateOrderBook();
      }
    });
  }

  unsubscribe() {
    this.cable.subscription.unsubscribe();
    delete this.cable;
    this.onUnsubscribe();
  }

  async updateOrders() {
    const json = await this.getOrderBook();
    ['buy', 'sell'].forEach(t => {
      Object.keys(json[t]).forEach(k => {
        json[t][k] = new BigNumber(json[t][k]);
      });
    });
    this.orderBook = json;
    this.updateOrderBook();
  }

  updateOrderBook() {
    this.buyOrders = Object.keys(this.orderBook.buy)
      .map(key => this.processOrderBook(key, this.orderBook.buy[key])).sort((a, b) => {
        return b.price - a.price;
      });
    this.sellOrders = Object.keys(this.orderBook.sell)
      .map(key => this.processOrderBook(key, this.orderBook.sell[key])).sort((a, b) => {
        return a.price - b.price;
      });

    this.onReceived({ buy: this.buyOrders, sell: this.sellOrders });
  }

  processOrderBook(key, amount) {
    const quote = this.client.tokenManager.toAmount(this.quote, amount);
    const price = parseFloat(key);
    return { price, amount: quote };
  }

  getOrderBook() {
    return rp(this.client.createRequest('orders', {
      qs: {
        contract: this.client.system.contract.substr(2),
        base: this.base.address.substr(2),
        token: this.quote.address.substr(2)
      }
    }));
  }
}

module.exports = OrderBook;
