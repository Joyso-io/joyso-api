const EventEmitter = require('events');
const rp = require('request-promise');

class System extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.advanceable = true;
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
    this.cable = this.client.cable.subscriptions.create({
      channel: 'SystemChannel'
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
    return promise;
  }

  destroy() {
    clearTimeout(this.retryTimer);
    this.cable.unsubscribe();
    delete this.cable;
  }

  async update() {
    try {
      clearTimeout(this.retryTimer);
      const json = await this.client.request('system');
      this.connected = true;
      this.contract = `0x${json.contracts[0]}`;
      this.advanceable = json.advanceable;
      this.updateConfig(json);
      return json;
    } catch (e) {
      this.emit('error', e);
      this.retryTimer = setTimeout(() => this.update(), 5000);
    }
  }

  updateConfig(json) {
    this.takerFee = json.taker_fee;
    this.makerFee = json.maker_fee;
    this.tradable = json.tradable;
    this.withdrawable = json.withdrawable;
    this.emit('update', json);
  }
}

module.exports = System;
