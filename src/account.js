const rp = require('request-promise');

class Account {
  constructor(client, address) {
    this.client = client;
    this.address = address;
    this.advanceReal;
    this.advanceInOrder;
    this.init = true;
  }

  subscribe() {
    return new Promise(resolve => {
      this.cable = this.client.cable.subscriptions.create({
        channel: 'AccountAdvanceChannel',
        contract: this.client.system.contract.substr(2),
        address: this.address.substr(2)
      }, {
        connected: async () => {
          await this.update();
          if (this.init) {
            this.init = false;
            resolve();
          }
        },
        received: data => {
          switch (data.e) {
            case 'update':
              this.updateConfig(data.data);
              break;
          }
        }
      });
    });
  }

  unsubscribe() {
    this.cable.unsubscribe();
    delete this.cable;
    this.init = false;
  }

  updateConfig(json) {
    this.advanceReal = json.advance_real;
    this.advanceInOrder = json.advance_in_order;
  }

  async update() {
    const json = await this.client.request('accounts/advance', { data: { user: this.address.substr(2) } });
    this.updateConfig(json);
  }
}

module.exports = Account;
