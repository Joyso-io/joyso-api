const rp = require('request-promise');

class System {
  constructor(client) {
    this.client = client;
  }

  subscribe() {
    this.cable = this.client.cable.subscriptions.create({
      channel: 'SystemChannel'
    }, {
      received: data => {
        switch (data.e) {
          case 'update':
            this.updateConfig(data.data);
            break;
        }
      }
    });
  }

  unsubscribe() {
    this.cable.unsubscribe();
    delete this.cable;
  }

  async update() {
    const json = await this.client.request('system');
    this.contract = `0x${json.contracts[0]}`;
    this.updateConfig(json);
    return json;
  }

  updateConfig(json) {
    this.takerFee = json.taker_fee;
    this.makerFee = json.maker_fee;
    this.tradable = json.tradable;
    this.withdrawable = json.withdrawable;
  }
}

module.exports = System;
