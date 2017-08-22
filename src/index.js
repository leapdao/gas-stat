import _ from 'lodash';
import BigNumber from 'bignumber.js';

const ETH_DECIMALS = new BigNumber(10).pow(18);

export default class Collector {

  constructor(sentry, db, etherScan) {
    this.sentry = sentry;
    this.db = db;
    this.etherScan = etherScan;
  }

  processMessage(message) {
    const tasks = [];

    if (!message.Subject || message.Subject.split('::').length < 2) {
      return [Promise.resolve(`unknown message type: ${message.Subject}`)];
    }

    try {
      const msgBody = (message.Message && message.Message.length > 0) ? JSON.parse(message.Message) : '';
      const [msgType, msgArg] = message.Subject.split('::');

      console.log(msgBody);

      if (msgType === 'HandComplete') {
        tasks.push(this.handleNewHand(msgArg));
      }
    } catch (e) {
      return [Promise.resolve(`json parse error: ${JSON.stringify(e)}`)];
    }


    return tasks;
  }

  handleNewHand(tableAddr) {
    return this.db.addHand(tableAddr);
  }

  async queryStat(accountAddress, from, to) {
    const hands = await this.db.getHandsInRange(from, to);
    const { result: transactions } = await this.etherScan.getAccountTransactions(accountAddress);
    const tables = _.groupBy(hands, 'tableAddr');
    const tableAddrs = Object.keys(tables);

    return tableAddrs.reduce((result, tableAddr) => {
      const tableTransactions = transactions.filter(tx => tx.to === tableAddr);
      const tableStat = tables[tableAddr].reduce(
        tableStatReducer(to, tableTransactions),
        { hand: new BigNumber(0), player: new BigNumber(0) }
      );

      return {
        ...result,
        [tableAddr]: {
          handsCount: tables[tableAddr].length,
          hand: tableStat.hand.div(tables[tableAddr].length).div(ETH_DECIMALS).toNumber(),
          player: tableStat.player.div(tables[tableAddr].length).div(ETH_DECIMALS).toNumber(),
        },
      };
    }, {});
  }

}

const tableStatReducer = (to, tableTransactions) => (tableStat, hand, i, hands) => {
  const nextHand = hands[i + 1];
  const handStart = Number(hand.created);
  const handFinish = nextHand ? Number(nextHand.created) : to;
  const handTransactions = tableTransactions.filter(
    tx => between(tx.timeStamp, handStart, handFinish),
  );

  const spent = handTransactions.reduce(
    (memo, tx) => memo.add(new BigNumber(tx.gasUsed).mul(tx.gasPrice)),
    new BigNumber(0),
  );

  return {
    player: spent.div(Number(hand.playersCount)).add(tableStat.player),
    hand: tableStat.hand.add(spent),
  };
};

function between(n, min, max) {
  return Number(n) >= min && Number(n) <= max;
}
