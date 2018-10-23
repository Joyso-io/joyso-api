const BigNumber = require('bignumber.js');

class TokenManager {
  constructor(client, options) {
    this.client = client;
    this.pairs = {};
    this.reload(options);
  }

  subscribe() {
    this.cable = this.client.cable.subscriptions.create({
      channel: 'TokensChannel'
    }, {
      received: data => {
        return;
        switch (data.e) {
          case 'update':
            const token = this.addressMap[`0x${data.data.address}`];
            if (token) {
              if (data.data.price) {
                token.price = new BigNumber(data.data.price);
                token.gasFee = new BigNumber(data.data.gas_fee);
                token.withdrawFee = new BigNumber(data.data.withdraw_fee);
              } else {
                token.price = null;
                token.gasFee = null;
                token.withdrawFee = null;
              }
              token.depositable = data.data.depositable;
              token.withdrawable = data.data.withdrawable;
              token.tradable = data.data.tradable;
            }
            break;
        }
      }
    });
  }

  async refresh() {
    const json = await this.client.system.update();
    if (json) {
      this.reload(json);
    }
  }

  reload(json) {
    this.tokens = json.tokens;
    this.symbolMap = {};
    this.addressMap = {};
    json.tokens.forEach(t => {
      t.address = `0x${t.address}`;
      if (t.price) {
        t.price = new BigNumber(t.price);
        t.gasFee = new BigNumber(t.gas_fee);
        t.withdrawFee = new BigNumber(t.withdraw_fee);
      }
      this.symbolMap[t.symbol] = t;
      this.addressMap[t.address] = t;
    });
    this.eth = this.symbolMap.ETH;
    this.joy = this.symbolMap.JOY;
    this.quotes = json.quotes.map(t => {
      const token = this.addressMap[`0x${t.address}`];
      token.precision = t.precision;
      return token;
    });
    this.pairs = {};
    this.pairs['ETH'] = new Set(this.tokens.map(t => t.symbol));
    Object.keys(json.pairs).forEach(k => this.pairs[k] = new Set(json.pairs[k]));
    Object.keys(json.hidden_pairs).forEach(k => {
      const set = this.pairs[k];
      if (set) {
        json.hidden_pairs[k].forEach(t => set.delete(t));
      }
    });
  }

  getPair(pair) {
    let [base, quote] = pair.split('_');
    return this.pairs[quote] && this.pairs[quote].has(base) ? [this.symbolMap[base], this.symbolMap[quote]] : [];
  }

  toAmount(token, rawAmount) {
    if (rawAmount) {
      const facotr = (new BigNumber(10)).pow(token.decimals);
      if (!(rawAmount instanceof BigNumber)) {
        rawAmount = new BigNumber(rawAmount);
      }
      return rawAmount.div(facotr);
    } else {
      return new BigNumber(0);
    }
  }

  toRawAmount(token, amount, fixedMethod = 'truncated') {
    if (amount) {
      const facotr = (new BigNumber(10)).pow(token.decimals);
      if (!(amount instanceof BigNumber)) {
        amount = new BigNumber(amount);
      }
      return amount.mul(facotr)[fixedMethod]();
    } else {
      return new BigNumber(0);
    }
  }
}

module.exports = TokenManager;
