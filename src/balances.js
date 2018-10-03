const rp = require('request-promise');
const BigNumber = require('bignumber.js');

class Balances {
  constructor(options = {}) {
    this.client = options.client;
    this.address = options.address;
    this.onReceived = options.onReceived || (() => {});
    this.balances = {};
    this.init = true;
  }

  subscribe() {
    return new Promise(resolve => {
      this.cable = this.client.cable.subscriptions.create({
        channel: 'BalancesChannel',
        contract: this.client.system.contract.substr(2),
        user: this.address.substr(2)
      }, {
        connected: async () => {
          await this.get();
          this.onReceived(this.balances);
          if (this.init) {
            this.init = false;
            resolve();
          }
        },
        received: balances => {
          balances.forEach(balance => this.updateBalance(balance));
          this.onReceived(this.balances);
        }
      });
    });
  }

  unsubscribe() {
    this.onReceived = (() => {});
  }

  updateBalance(balance) {
    const address = '0x' + balance.token;
    const token = this.client.tokenManager.addressMap[address];
    const available = new BigNumber(balance.joyso).add(balance.trading).sub(balance.withdrawing).sub(balance.in_order).sub(balance.depositing);
    this.balances[token.symbol] = {
      inOrder: this.client.tokenManager.toAmount(token, balance.in_order),
      available: this.client.tokenManager.toAmount(token, available)
    }
  }

  async get() {
    const json = await rp(this.client.createRequest('balances', {
      qs: {
        contract: this.client.system.contract.substr(2),
        user: this.address.substr(2)
      }
    }));
    json.balances.forEach(balance => this.updateBalance(balance));
  }
}

module.exports = Balances;
