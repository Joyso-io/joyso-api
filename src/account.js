const EventEmitter = require('events');
const rp = require('request-promise');

class Account extends EventEmitter {
  constructor(client, address) {
    super();
    this.client = client;
    this.address = address;
  }

  connect() {
    if (this.cable) {
      return Promise.reject();
    }
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      this.once('update', () => {
        clearTimeout(timer);
        resolve();
      });
      this.once('error', e => {
        clearTimeout(timer);
        reject(e);
      });
    });
    this.watchMyAdvance();
    return promise;
  }

  destroy() {
    clearTimeout(this.retryTimer);
    this.cable.unsubscribe();
    delete this.cable;
  }

  watchMyAdvance() {
    if (!this.client.system.advanceable) {
      this.advanceReal = 0;
      this.advanceInOrder = 0;
      this.emit('update', { advance_real: 0, advance_in_order: 0});
      return;
    }
    this.cable = this.client.cable.subscriptions.create({
      channel: 'AccountAdvanceChannel',
      contract: this.client.system.contract.substr(2),
      address: this.address.substr(2)
    }, {
      connected: () => this.update(),
      received: data => {
        switch (data.e) {
          case 'update':
            this.updateConfig(data.data);
            break;
        }
      }
    });
  }

  async update() {
    try {
      clearTimeout(this.retryTimer);
      const json = await this.client.request('accounts/advance', { data: { user: this.address.substr(2) } });
      this.updateConfig(json);
    } catch (e) {
      this.emit('error', e);
      this.retryTimer = setTimeout(() => this.update(), 5000);
    }
  }

  updateConfig(json) {
    this.advanceReal = json.advance_real;
    this.advanceInOrder = json.advance_in_order;
    this.emit('update', json);
  }
}

module.exports = Account;
