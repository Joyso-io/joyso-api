const Joyso = require('../src/joyso');

async function start() {
  const client = new Joyso({
    // your private key
    key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  });

  await client.connect();

  // subscribe order book, notify if change
  client.subscribeOrderBook('ETH_JOY', orderBook => {
    console.log(JSON.stringify(orderBook));
    // {"buy":[{"price":0.000123456,"amount":"8.5"},{"price":0.000123455,"amount":"98.5"}],"sell":[{"price":0.00012346,"amount":"100"},{"price":0.00012347,"amount":"500"},{"price":0.0001235,"amount":"1000"}]}
  });

  // subscribe market trades, notify if change
  client.subscribeTrades('ETH_JOY', trades => {
    console.log(JSON.stringify(trades.slice(0, 5)));
    // [{"id":317,"side":"sell","price":"0.000123456","amount":"2","pair":"ETH_JOY"},{"id":315,"side":"buy","price":"0.00012347","amount":"1","pair":"ETH_JOY"},{"id":313,"side":"sell","price":"0.000123456","amount":"1.5","pair":"ETH_JOY"},{"id":307,"side":"sell","price":"0.000123455","amount":"1.5","pair":"ETH_JOY"},{"id":305,"side":"buy","price":"0.000123455","amount":"100","pair":"ETH_JOY"}]
  });

  // subscribe balances, notify if change
  client.subscribeBalances(balances => {
    console.log(JSON.stringify(balances));
    // {"JOY":{"inOrder":"0","available":"4.5"},"ETH":{"inOrder":"0.001447757819","available":"0.097815997145"}}
  });

  // subscribe open orders, notify if change
  client.subscribeOrders(orders => {
    console.log(JSON.stringify(orders));
    // [{"id":354,"status":"active","side":"buy","price":"0.000123481","amount":"1","fill":"0","pair":"ETH_T00"},{"id":353,"status":"active","side":"buy","price":"0.000123481","amount":"1","fill":"0","pair":"ETH_T00"},{"id":326,"status":"partial","side":"buy","price":"0.000123456","amount":"12","fill":"3.5","pair":"ETH_JOY"}]
  });

  // subscribe my trades, notify if change
  client.subscribeMyTrades(trades => {
    console.log(JSON.stringify(trades));
    // [{"id":317,"status":"done","txHash":"0xcf0aeb815200951559a38650a84f8eefa46411224e5e4076d6313ab47c7f9bb5","side":"sell","price":"0.000123456","amount":"2","pair":"ETH_JOY","fee":"ETH","gasFee":"0","txFee":"2.46912e-7"},{"id":316,"status":"done","txHash":"0x582cc7a84e8aa7e28e44b11e22f24169a34776915ebbc95a88fa0e77c44faf4c","side":"sell","price":"0.00012347","amount":"1","pair":"ETH_JOY","fee":"ETH","gasFee":"0.000105","txFee":"2.4694e-7"},{"id":313,"status":"done","txHash":"0x0654f47d05db6848b7f07c75af19408a865d9254657f7de9d5e0ed65e2deadaf","side":"sell","price":"0.000123456","amount":"1.5","pair":"ETH_JOY","fee":"ETH","gasFee":"0.000075","txFee":"1.85184e-7"}]
  });

  try {
    let order;

    // place buying order
    order = await client.buy({
      pair: 'ETH_JOY',
      price: '0.000123481',
      amount: 1,
      fee: 'base'
    });
    console.log(JSON.stringify(order));
    // {"id":361,"status":"complete","side":"buy","price":"0.000123481","amount":"1","fill":"1","pair":"ETH_JOY"}

    // place selling order
    order = await client.sell({
      pair: 'ETH_JOY',
      price: '0.000123481',
      amount: 100,
      fee: 'base'
    });
    console.log(JSON.stringify(order));
    // {"id":363,"status":"active","side":"sell","price":"0.000123481","amount":"100","fill":"0","pair":"ETH_JOY"}

    // or place order by trade with side
    order = await client.trade({
      side: 'buy',
      pair: 'ETH_JOY',
      price: '0.000123481',
      amount: 100,
      fee: 'joy'
    });
  } catch (e) {
    if (e.statusCode === 400) {
      console.log(e.error.error);
    } else {
      console.log(e.message);
    }
  }

  // cancel order
  await client.cancel(363);
}

start();

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection:', reason);
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});
