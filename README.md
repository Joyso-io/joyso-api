# JOYSO
JOYSO API client library for trading.

## Installation
You can use this command to install:

    npm install joyso

## Usage
Setup and connect to JOYSO
```JavaScript
const Joyso = require('joyso');

async function start() {
  const joyso = new Joyso({
    // your private key
    key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  });

  await joyso.connect();
}

```

### subscribeOrderBook(pair, callback)
Subscribe order book, notify if change.
```JavaScript
const subscription = joyso.subscribeOrderBook('ETH_JOY', orderBook => {
  console.log(JSON.stringify(orderBook));
});
```
Result:
```JSON
{
  "buy":[
    {
      "price":0.000123456,
      "amount":"8.5"
    },
    {
      "price":0.000123455,
      "amount":"98.5"
    }
  ],
  "sell":[
    {
      "price":0.00012346,
      "amount":"100"
    },
    {
      "price":0.00012347,
      "amount":"500"
    }
  ]
}
```
* amount is BigNumber object.

### subscribeTrades(pair, callback)
Subscribe market trades, notify if change, return last 100 records.
```JavaScript
const subscription = joyso.subscribeTrades('ETH_JOY', trades => {
  console.log(JSON.stringify(trades.slice(0, 2)));
});
```
Result
```JSON
[
  {
    "id":317,
    "side":"sell",
    "price":0.000123456,
    "amount":"2",
    "pair":"ETH_JOY"
  },
  {
    "id":315,
    "side":"buy",
    "price":0.00012347,
    "amount":"1",
    "pair":"ETH_JOY"
  }
]
```
* amount is BigNumber object.

### subscribeBalances(callback)
Subscribe balances, notify if change.
```JavaScript
const subscription = joyso.subscribeBalances(balances => {
  console.log(JSON.stringify(balances));
});
```
Result
```JSON
{
  "JOY":{
    "inOrder":"0",
    "available":"4.5"
  },
  "ETH":{
    "inOrder":"0.001447757819",
    "available":"0.097815997145"
  }
}
```
* inOrder and available are BigNumber objects.

### subscribeOrders(callback)
Subscribe open orders, notify if change.
```JavaScript
const subscription = joyso.subscribeOrders(orders => {
  console.log(JSON.stringify(orders));
});
```
Result
```JSON
[
  {
    "id":353,
    "status":"active",
    "side":"buy",
    "price":0.000123481,
    "amount":"1",
    "fill":"0",
    "pair":"ETH_T00"
  },
  {
    "id":326,
    "status":"partial",
    "side":"buy",
    "price":0.000123456,
    "amount":"12",
    "fill":"3.5",
    "pair":"ETH_JOY"
  }
]
```
* amount and fill are BigNumber objects.
* status could be `active` or `partial`

### subscribeMyTrades(callback)
Subscribe my trades, notify if change, return last 100 records.
```JavaScript
const subscription = joyso.subscribeMyTrades(trades => {
  console.log(JSON.stringify(trades.slice(0, 2)));
});
```
Result
```JSON
[
  {
    "id":317,
    "status":"done",
    "txHash":"0xcf0aeb815200951559a38650a84f8eefa46411224e5e4076d6313ab47c7f9bb5",
    "side":"sell",
    "price":0.000123456,
    "amount":"2",
    "pair":"ETH_JOY",
    "fee":"ETH",
    "gasFee":"0",
    "txFee":"2.46912e-7"
  },
  {
    "id":316,
    "status":"done",
    "txHash":"0x582cc7a84e8aa7e28e44b11e22f24169a34776915ebbc95a88fa0e77c44faf4c",
    "side":"sell",
    "price":0.00012347,
    "amount":"1",
    "pair":"ETH_JOY",
    "fee":"ETH",
    "gasFee":"0.000105",
    "txFee":"2.4694e-7"
  }
]
```
* amount, gasFee and txFee are BigNumber objects.

### subscribeFunds(callback)
Subscribe funds, notify if change, return last 100 records.
```JavaScript
const subscription = joyso.subscribeFunds(funds => {
  console.log(JSON.stringify(funds));
});
```
Result
```JSON
[
  {
    "id":192,
    "status":"done",
    "txHash":"0x4dbc49ae4735b1c230244d41377cf6aeccd70c5181df048e3be8306af8a487e6",
    "type":"withdraw",
    "amount":"0.0099",
    "token":"ETH",
    "fee":"ETH",
    "withdrawFee":"0.0001",
    "timestamp":1537434044,
    "blockId":null
  },
  {
    "id":191,
    "status":"done",
    "txHash":"0x8435bf9f69dd908373d50353ebab343b625527cd8ea44532eb01c8b0a5642879",
    "type":"withdraw",
    "amount":"0.001",
    "token":"ETH",
    "fee":"JOY",
    "withdrawFee":"0.809841",
    "timestamp":1537433888,
    "blockId":null
  }
]
```
* amount and withdrawFee are BigNumber objects.
* status could be `pending`, `processing`, `done` or `failed`
* type could be `deposit`, `withdraw` or `transfer`

### buy({ pair, price, amount, fee })
Place buying order
```JavaScript
try {
  let order = await joyso.buy({
    pair: 'ETH_JOY',
    price: '0.000123481',
    amount: 1,
    fee: 'base'
  });
  console.log(JSON.stringify(order));
} catch (e) {
  if (e.statusCode === 400) {
    console.log(e.error.error);
  } else {
    console.log(e.message);
  }
}
```
Options

|Name|Required|Description|
|---|---|---|
|pair|O|Pair to trade, format is `${base}_${quote}`, eg: ETH_JOY|
|price|O|Order price, minimum is 0.000000001|
|amount|O|Quote amount|
|fee|O|Specify how to pay fee. `base` or `joy`.|

Result
```JSON
{
  "id":361,
  "status":"complete",
  "side":"buy",
  "price":0.000123481,
  "amount":"1",
  "fill":"1",
  "pair":"ETH_JOY"
}
```
* amount and fill are BigNumber objects.
* status could be `active`, `partial` or `complete`

### sell({ pair, price, amount, fee })
Place selling order
```JavaScript
let order = await joyso.sell({
  pair: 'ETH_JOY',
  price: '0.000123481',
  amount: 100,
  fee: 'base'
});
```
Options and result are same with buy.

### trade({ pair, price, amount, fee, side })
Place order
```JavaScript
let order = await joyso.trade({
  side: 'buy',
  pair: 'ETH_JOY',
  price: '0.000123481',
  amount: 100,
  fee: 'joy'
});
```
Options and result are same with buy. One extra options

|Name|Required|Description|
|---|---|---|
|side|O|`buy` or `sell`|

### withdraw({ token, amount, fee })
Withdraw
```JavaScript
await joyso.withdraw({
  token: 'ETH',
  amount: 0.01,
  fee: 'eth'
});
```
Options

|Name|Required|Description|
|---|---|---|
|token|O|Token to withdraw|
|amount|O|Amount to withdraw|
|fee|O|Specify how to pay fee. `eth` or `joy`.|

### disconnect()
Disconnect from JOYSO.

### subscription.unsubscribe()
Unsubscribe
```JavaScript
subscription.unsubscribe();
```


## License
The project is released under the [MIT license](http://www.opensource.org/licenses/MIT).

## Contact
The project's website is located at https://github.com/Joyso-io/joyso-api
