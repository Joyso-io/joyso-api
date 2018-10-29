const rp = require('request-promise');
const ethUtil = require('ethereumjs-util');
const BigNumber = require('bignumber.js');
const _ = require('lodash');
const ActionCable = require('./actioncable');
const System = require('./system');
const TokenManager = require('./token_manager');
const Balances = require('./balances');
const Orders = require('./orders');
const OrderBook = require('./order-book');
const Trades = require('./trades');
const MyTrades = require('./my-trades');
const Funds = require('./funds');
const Account = require('./account');

BigNumber.config({ DECIMAL_PLACES: 36 });

const ETH_MAX_FEE_PRICE = new BigNumber('100000000');
const NON_ETH_MAX_FEE_PRICE = new BigNumber('1000000000000000000000000000');
const keys = {};

class Joyso {
  constructor(options = {}) {
    this.host = options.host || 'joyso.io';
    this.ssl = options.ssl === undefined ? true : options.ssl;
    let key = options.key;
    if (key.indexOf('0x') !== 0) {
      key = `0x${key}`;
    }
    this.keyIndex = Object.keys(keys).length;
    keys[this.keyIndex] = key;
    this.address = `0x${ethUtil.privateToAddress(key).toString('hex')}`;
    this.orderBooks = {};
    this.trades = {};
    this.hashTable = {};
  }

  async connect() {
    if (this.connected) {
      return;
    }
    this.cable = ActionCable.createConsumer(this.wsUrl, this.origin);
    this.system = new System(this);
    this.system.once('update', json => {
      this.tokenManager = new TokenManager(this, json);
      this.tokenManager.subscribe();
    });
    await this.system.connect();
    this.account = new Account(this, this.address);
    await this.account.connect();
    this.balances = new Balances({ client: this, address: this.address });
    await this.balances.subscribe();
    await this.updateAccessToken();
    this.orders = new Orders({
      client: this,
      address: this.address
    });
    this.myTrades = new MyTrades({
      client: this,
      address: this.address
    });
    this.funds = new Funds({
      client: this,
      address: this.address
    });
    this.connected = true;
  }

  async disconnect() {
    this.cable.disconnect();
    clearTimeout(this.timer);
    this.connected = false;
    delete this.accessToken;
  }

  async updateAccessToken() {
    const nonce = Math.floor(Date.now() / 1000);
    const raw = `Signing this message proves to JOYSO you are in control of your account without giving JOYSO access to any sensitive information. Message ID: ${nonce}`;
    const vrs = this.sign(new Buffer(raw, 'utf8'));
    try {
      const r = await this.request('accounts', {
        method: 'POST',
        data: Object.assign({
          user: this.address.substr(2),
          nonce: nonce,
          version: 2,
          locale: 'en'
        }, vrs)
      });
      this.accessToken = r.access_token;
    } finally {
      this.timer = setTimeout(() => this.updateAccessToken(), 6000 * 60);
    }
  }

  async withdraw(options) {
    const withdraw = this.createWithdraw(options);
    try {
      const r = await this.request('withdraw_queues', {
        method: 'POST',
        data: withdraw,
        auth: true
      });
    } catch (e) {
      if (!options.retry && e.statusCode === 400 && e.error.fee_changed) {
        options.retry = true;
        await this.tokenManager.refresh();
        return this.withdraw(options);
      }
      throw e;
    }
  }

  repayWithdrawFee(token) {
    if (this.account.advanceReal !== 0 && this.account.advanceInOrder === 0) {
      const ratio = this.tokenManager.eth.withdrawFee.div(token.withdrawFee);
      return new BigNumber(this.account.advanceReal).div(ratio).truncated().add(token.withdrawFee);
    } else {
      return token.withdrawFee;
    }
  }

  createWithdraw({ token, amount, fee }) {
    this.validateWithdraw(amount, fee);
    let tokenFee, paymentMethod;
    if (fee === 'token') {
      tokenFee = this.tokenManager.symbolMap[token];
      paymentMethod = 2;
    } else if (fee === 'joy') {
      tokenFee = this.tokenManager.joy;
      paymentMethod = 1;
    } else {
      tokenFee = this.tokenManager.eth;
      paymentMethod = 0;
    }
    token = this.tokenManager.symbolMap[token];
    if (!token) {
      throw new Error('invalid token');
    }
    const withdrawFee = this.repayWithdrawFee(tokenFee);
    let rawAmount = this.tokenManager.toRawAmount(token, amount);
    if (token === tokenFee) {
      rawAmount = rawAmount.sub(withdrawFee);
    }
    const timestamp = Date.now();
    const nonce = Math.floor(timestamp / 1000);
    let data = _.padStart(nonce.toString(16), 8, '0');
    data += '000000000000000';
    data += paymentMethod;

    let input = this.system.contract.substr(2);
    input += _.padStart(rawAmount.toString(16), 64, '0');
    input += _.padStart(withdrawFee.toString(16), 64, '0');
    input += data;
    input += token.address.substr(2);
    const hash = ethUtil.keccak256(new Buffer(input, 'hex'));
    const vrs = this.sign(hash);

    return Object.assign({
      nonce,
      contract: this.system.contract.substr(2),
      amount: rawAmount.toString(10),
      fee: withdrawFee.toString(10),
      user: this.address.substr(2),
      token: token.address.substr(2),
      payment_method: fee
    }, vrs)
  }

  async buy(options) {
    options.side = 'buy';
    return this.trade(options);
  }

  async sell(options) {
    options.side = 'sell';
    return this.trade(options);
  }

  async trade(options) {
    const order = this.createOrder(options);
    try {
      const hash = order.hash;
      delete order.hash;
      const r = await this.request('orders', {
        method: 'POST',
        data: order,
        auth: true
      });
      this.updateHashTable(order.nonce, hash);
      order.id = r.order.id;
      order.status = r.order.status;
      order.amount_fill = r.order.amount_fill;
      return this.orders.convert([order])[0];
    } catch (e) {
      if (!options.retry && e.statusCode === 400 && e.error.fee_changed) {
        await this.tokenManager.refresh();
        if (e.error.length === 1) {
          options.retry = true;
          return this.trade(options);
        }
      }
      throw e;
    }
  }

  async getMyTrades({ from, to, quote, base, side, before, limit } = {}) {
    const options = {};
    quote = this.tokenManager.symbolMap[quote];
    if (quote) {
      if (this.tokenManager.quotes.find(t => t === quote)) {
        options.token_base = quote.address.substr(2);
      } else {
        throw new Error('invalid quote');
      }
    }
    base = this.tokenManager.symbolMap[base];
    if (base) {
      options.token_target = base.address.substr(2);
    }
    if (side === 'buy') {
      options.is_buy = true;
    } else if (side === 'sell') {
      options.is_buy = false
    }
    if (from) {
      options.from = from;
    }
    if (to) {
      options.to = to;
    }
    if (before) {
      options.before = before;
    }
    if (limit) {
      options.limit = limit;
    }
    options.user = this.address.substr(2);
    const json = await this.request('trades/history', { data: options });
    return this.myTrades.convert(json.trades);
  }

  toAmountByPrice(token, baseAmount, price, method) {
    const amount = this.tokenManager.toRawAmount(token, baseAmount.mul(price), method);
    return this.tokenManager.toAmount(token, amount);
  }

  toPrice(baseAmount, quoteAmount) {
    return quoteAmount.div(baseAmount).round(9);
  }

  validateAmount(amount) {
    const lte = amount instanceof BigNumber ? amount.lte(0) : amount <= 0;;
    if (lte) {
      throw new Error('invalid amount');
    }
  }

  validateWithdraw(amount, fee) {
    this.validateAmount(amount);
    if (fee !== 'eth' && fee !== 'joy' && fee !== 'token') {
      throw new Error('invalid fee');
    }
  }

  validateOrder(price, amount, side, quote) {
    this.validateAmount(amount);
    const precision = new BigNumber(10).pow(quote.precision);
    const v = new BigNumber(price).mul(precision);
    if (!v.truncated().equals(v)) {
      throw new Error('invalid price');
    }
    if (side !== 'buy' && side !== 'sell') {
      throw new Error('invalid side');
    }
  }

  validatePair(base, quote) {
    if (!base || !quote || !this.tokenManager.quotes.find(t => t === quote)) {
      throw new Error('invalid pair');
    }
  }

  repayGasFee(token) {
    const ratio = new BigNumber(this.tokenManager.eth.gasFee).div(token.gasFee);
    return new BigNumber(this.account.advanceReal).div(ratio).truncated().add(token.gasFee);
  }

  receivableGasFee(side, feeByJoy, tokenFee, quote) {
    let gasFee = quote.gasFee;
    let baseBalance = this.balances.balances[quote.symbol];
    baseBalance = this.tokenManager.toRawAmount(quote, baseBalance && baseBalance.available || 0);
    if (
      side !== 'buy' && !feeByJoy && gasFee.gt(baseBalance)
      && this.account.advanceReal === 0 && this.account.advanceInOrder === 0
    ) {
      return new BigNumber(0);
    } else if (this.account.advanceReal !== 0 && this.account.advanceInOrder === 0) {
      return this.repayGasFee(tokenFee);
    } else {
      return tokenFee.gasFee;
    }
  }

  createOrder({ pair, price, amount, feeByJoy, side }) {
    const [base, quote]= this.tokenManager.getPair(pair);
    this.validatePair(base, quote);
    this.validateOrder(price, amount, side, quote);
    let baseAmount = new BigNumber(amount);
    let method = side === 'buy' ? 'ceil' : 'floor';
    let quoteAmount = this.toAmountByPrice(quote, baseAmount, price, method);
    if (!this.toPrice(baseAmount, quoteAmount).equals(price)) {
      method = method === 'floor' ? 'ceil' : 'floor';
      quoteAmount = this.toAmountByPrice(quote, baseAmount, price, method);
      if (!this.toPrice(baseAmount, quoteAmount).equals(price)) {
        throw new Error('invalid amount, too small');
      }
    }
    baseAmount = this.tokenManager.toRawAmount(base, baseAmount);
    quoteAmount = this.tokenManager.toRawAmount(quote, quoteAmount);

    let takerFee, makerFee, tokenFee, feePrice, custom = false;
    if (base.taker_fee && base.maker_fee) {
      takerFee = base.taker_fee;
      makerFee = base.maker_fee;
      custom = true;
    } else {
      takerFee = this.system.takerFee;
      makerFee = this.system.makerFee;
    }

    if (feeByJoy) {
      tokenFee = this.tokenManager.joy;
      if (!custom) {
        takerFee = Math.floor(takerFee / 2);
        makerFee = Math.floor(makerFee / 2);
      }
      feePrice = tokenFee.price;
      let maxFeePrice, offset;
      if (quote === this.tokenManager.eth) {
        maxFeePrice = ETH_MAX_FEE_PRICE;
        offset = new BigNumber('10000000');
      } else {
        const priceToEth = quote.price;
        if (feePrice && priceToEth) {
          const decimalsOffset = new BigNumber(10).pow(tokenFee.decimals - quote.decimals);
          offset = new BigNumber('1000000000000').div(decimalsOffset);
          feePrice = new BigNumber(feePrice).div(priceToEth);
        } else {
          throw new Error('fee price invalid');
        }
        maxFeePrice = NON_ETH_MAX_FEE_PRICE;
      }
      feePrice = feePrice.mul(offset).truncated();
      if (feePrice.gt(maxFeePrice)) {
        feePrice = maxFeePrice;
      } else if (feePrice.lt(1)) {
        feePrice = new BigNumber(1);
      }
    } else {
      tokenFee = quote;
      feePrice = 0;
    }
    const gasFee = this.receivableGasFee(side, feeByJoy, tokenFee, quote);

    let amountSell, amountBuy, tokenSell, tokenBuy;
    if (side === 'buy') {
      amountSell = quoteAmount;
      amountBuy = baseAmount;
      tokenSell = quote.address;
      tokenBuy = base.address;
    } else {
      amountSell = baseAmount;
      amountBuy = quoteAmount;
      tokenSell = base.address;
      tokenBuy = quote.address;
    }

    const createHash = (nonce) => {
      let input;
      if (quote === this.tokenManager.eth) {
        let data = _.padStart(nonce.toString(16), 8, '0');
        data += _.padStart(takerFee.toString(16), 4, '0');
        data += _.padStart(makerFee.toString(16), 4, '0');
        data += _.padStart(feePrice.toString(16), 7, '0');
        data += side === 'buy' ? '1' : '0';

        input = this.system.contract.substr(2);
        input += _.padStart(amountSell.toString(16), 64, '0');
        input += _.padStart(amountBuy.toString(16), 64, '0');
        input += _.padStart(gasFee.toString(16), 64, '0');
        input += data;
        input += base.address.substr(2);
      } else {
        let data = _.padStart(nonce.toString(16), 8, '0');
        data += _.padStart(takerFee.toString(16), 4, '0');
        data += _.padStart(makerFee.toString(16), 4, '0');
        data += '0000000';
        data += side === 'buy' ? '1' : '0';

        input = this.system.contract.substr(2);
        input += _.padStart(amountSell.toString(16), 64, '0');
        input += _.padStart(amountBuy.toString(16), 64, '0');
        input += _.padStart(gasFee.toString(16), 64, '0');
        input += data;
        input += base.address.substr(2);
        input += quote.address.substr(2);
        input += _.padStart(feePrice.toString(16), 64, '0');
      }
      return ethUtil.keccak256(new Buffer(input, 'hex'));
    };

    const timestamp = Date.now();
    const nonce = Math.floor(timestamp / 1000);
    let hash = createHash(nonce);
    let retry = 0;
    while (this.hashTable[nonce] && this.hashTable[nonce][hash] && retry < 60) {
      hash = createHash(nonce + ++retry);
    }
    const vrs = this.sign(hash);
    return Object.assign({
      nonce,
      maker_fee: makerFee,
      taker_fee: takerFee,
      fee_price: feePrice.toString(10),
      token_sell: tokenSell.substr(2),
      token_buy: tokenBuy.substr(2),
      user: this.address.substr(2),
      contract: this.system.contract.substr(2),
      gas_fee: gasFee.toString(10),
      amount_sell: amountSell.toString(10),
      amount_buy: amountBuy.toString(10),
      payment_method: feeByJoy ? 'joy' : 'base',
      hash: hash.toString('hex'),
      is_buy: side === 'buy'
    }, vrs);
  }

  cancel(orderId) {
    return this.request(`orders/${orderId}`, {
      method: 'DELETE',
      auth: true
    });
  }

  subscribeOrderBook(pair, callback) {
    if (!this.connected) {
      throw new Error('client is not connected');
    }
    const [base, quote] = this.tokenManager.getPair(pair);
    this.validatePair(base, quote);
    if (this.orderBooks[pair]) {
      this.orderBooks[pair].unsubscribe();
    }
    this.orderBooks[pair] = new OrderBook({
      base, quote,
      client: this,
      onReceived: callback,
      onUnsubscribe: () => delete this.orderBooks[pair]
    });
    this.orderBooks[pair].subscribe();
    return this.orderBooks[pair];
  }

  subscribeTrades(pair, callback) {
    if (!this.connected) {
      throw new Error('client is not connected');
    }
    const [base, quote] = this.tokenManager.getPair(pair);
    this.validatePair(base, quote);
    if (this.trades[pair]) {
      this.trades[pair].unsubscribe();
    }
    this.trades[pair] = new Trades({
      base, quote,
      client: this,
      onReceived: callback,
      onUnsubscribe: () => delete this.trades[pair]
    });
    this.trades[pair].subscribe();
    return this.trades[pair];
  }

  subscribeMyTrades(callback) {
    if (!this.connected) {
      throw new Error('client is not connected');
    }
    this.myTrades.onReceived = callback;
    if (this.myTrades.cable) {
      this.myTrades.unsubscribe();
    }
    this.myTrades.subscribe();
    return this.myTrades;
  }

  subscribeOrders(callback) {
    if (!this.connected) {
      throw new Error('client is not connected');
    }
    this.orders.onReceived = callback;
    if (this.orders.cable) {
      this.orders.unsubscribe();
    }
    this.orders.subscribe();
    return this.orders;
  }

  subscribeBalances(callback) {
    if (!this.connected) {
      throw new Error('client is not connected');
    }
    this.balances.onReceived = callback;
    this.balances.onReceived(this.balances.balances);
    return this.balances;
  }

  subscribeFunds(callback) {
    if (!this.connected) {
      throw new Error('client is not connected');
    }
    this.funds.onReceived = callback;
    if (this.funds.cable) {
      this.funds.unsubscribe();
    }
    this.funds.subscribe();
    return this.funds;
  }

  sign(message) {
    const result = ethUtil.hashPersonalMessage(message);
    const vrs = ethUtil.ecsign(result, ethUtil.toBuffer(keys[this.keyIndex]));
    return {
      v: vrs.v,
      r: vrs.r.toString('hex'),
      s: vrs.s.toString('hex'),
    };
  }

  updateHashTable(nonce, hash) {
    if (!this.hashTable[nonce]) {
      this.hashTable[nonce] = {};
    }
    this.hashTable[nonce][hash] = true;
    const now = Math.floor(Date.now() / 1000);
    Object.keys(this.hashTable).forEach(k => {
      if (k < now) {
        delete this.hashTable[k];
      }
    });
  }

  get origin() {
    const protocol = this.ssl ? 'https' : 'http'
    return `${protocol}://${this.host}`;
  }

  get apiUrl() {
    return `${this.origin}/api/v1`;
  }

  get wsUrl() {
    const protocol = this.ssl ? 'wss' : 'ws'
    return `${protocol}://${this.host}/cable`;
  }

  request(path, options = {}) {
    let { headers, method, auth, data = {} } = options;
    delete options.data;
    delete options.auth;

    if (auth) {
      headers = headers || {};
      headers['Authorization'] = `Bearer ${this.accessToken}`;
      options.headers = headers;
    }

    const attr = (method || 'GET').toUpperCase() == 'GET' ? 'qs' : 'body';
    options[attr] = options[attr] || {};
    Object.assign(options[attr], data);

    options = Object.assign({
      uri: `${this.apiUrl}/${path}`,
      json: true
    }, options);
    return rp(options);
  }
}

module.exports = Joyso;
