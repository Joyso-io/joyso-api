const Joyso = require('../src/joyso');

async function start() {
  const joyso = new Joyso({
    // your private key
    key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  });

  await joyso.connect();

  // subscribe order book, notify if change
  joyso.subscribeOrderBook('JOY_ETH', orderBook => {
    console.log(JSON.stringify(orderBook));
  });

  // subscribe market trades, notify if change
  joyso.subscribeTrades('JOY_ETH', trades => {
    console.log(JSON.stringify(trades.slice(0, 5)));
  });

  // subscribe balances, notify if change
  joyso.subscribeBalances(balances => {
    console.log(JSON.stringify(balances));
  });

  // subscribe open orders, notify if change
  joyso.subscribeOrders(orders => {
    console.log(JSON.stringify(orders));
  });

  // subscribe my trades, notify if change
  joyso.subscribeMyTrades(trades => {
    console.log(JSON.stringify(trades));
  });

  // subscribe funds, notify if change
  joyso.subscribeFunds(funds => {
    console.log(JSON.stringify(funds));
  });

  try {
    let order;

    // place buying order
    order = await joyso.buy({
      pair: 'JOY_ETH',
      price: '0.000123481',
      amount: 1,
      fee: 'base'
    });

    // place selling order
    order = await joyso.sell({
      pair: 'JOY_ETH',
      price: '0.000123481',
      amount: 100,
      fee: 'base'
    });

    // or place order by trade with side
    order = await joyso.trade({
      side: 'buy',
      pair: 'JOY_ETH',
      price: '0.000123481',
      amount: 100,
      fee: 'joy'
    });

    // cancel order
    await joyso.cancel(363);

    // withdraw
    await joyso.withdraw({
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
