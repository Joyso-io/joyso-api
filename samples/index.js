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
  });

  // subscribe market trades, notify if change
  client.subscribeTrades('ETH_JOY', trades => {
    console.log(JSON.stringify(trades.slice(0, 5)));
  });

  // subscribe balances, notify if change
  client.subscribeBalances(balances => {
    console.log(JSON.stringify(balances));
  });

  // subscribe open orders, notify if change
  client.subscribeOrders(orders => {
    console.log(JSON.stringify(orders));
  });

  // subscribe my trades, notify if change
  client.subscribeMyTrades(trades => {
    console.log(JSON.stringify(trades));
  });

  // subscribe funds, notify if change
  client.subscribeFunds(funds => {
    console.log(JSON.stringify(funds));
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

    // place selling order
    order = await client.sell({
      pair: 'ETH_JOY',
      price: '0.000123481',
      amount: 100,
      fee: 'base'
    });

    // or place order by trade with side
    order = await client.trade({
      side: 'buy',
      pair: 'ETH_JOY',
      price: '0.000123481',
      amount: 100,
      fee: 'joy'
    });

    // cancel order
    await client.cancel(363);

    // withdraw
    await client.withdraw({
      token: 'ETH',
      amount: 0.01,
      fee: 'eth'
    });
  } catch (e) {
    if (e.statusCode === 400) {
      console.log(e.error.error);
    } else {
      throw e;
      console.log(e.message);
    }
  }
}

start();

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection:', reason);
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});
