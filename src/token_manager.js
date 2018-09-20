const BigNumber = require('bignumber.js');

class TokenManager {
  constructor(tokens) {
    this.tokens = tokens;
    this.symbolMap = {};
    this.addressMap = {};
    tokens.forEach(t => {
      t.address = `0x${t.address}`;
      this.symbolMap[t.symbol] = t;
      this.addressMap[t.address] = t;
    });
    this.eth = this.symbolMap.ETH;
    this.joy = this.symbolMap.JOY;
  }

  getPair(pair) {
    let [base, quote] = pair.split('_');
    return [this.symbolMap[base], this.symbolMap[quote]];
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
