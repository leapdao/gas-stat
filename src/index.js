import _ from 'lodash';
import BigNumber from 'bignumber.js';

const ETH_DECIMALS = new BigNumber(10).pow(18);

export default class Collector {

  constructor(sentry, db) {
    this.sentry = sentry;
    this.db = db;
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

  async queryStat(from, to) {
    const hands = await this.db.handsInRange(from, to);
    const tables = _.groupBy(hands, 'tableAddr');
    const tableAddrs = Object.keys(tables);
    const { result: transactions } = { result: [] };

    const result = {};
    for (let i = 0; i < tableAddrs.length; i += 1) {
      const tableAddr = tableAddrs[i];
      const tableTransactions = transactions.filter(tx => tx.to === tableAddr);
      const tableStat = {
        hand: new BigNumber(0),
        player: new BigNumber(0),
      };
      for (let j = 0; j < tables[tableAddr].length; j += 1) {
        const hand = tables[tableAddr][j];
        const nextHand = tables[tableAddr][j];
        const handStart = Number(hand.created);
        const handFinish = nextHand ? Number(nextHand.created) : to;
        const handTransactions = tableTransactions.filter(
          tx => between(tx.timeStamp, handStart, handFinish),
        );

        const spentForGas = handTransactions.reduce((memo, tx) => {
          const txFee = new BigNumber(tx.gasUsed).mul(tx.gasPrice).div(ETH_DECIMALS);
          return memo.add(txFee);
        }, new BigNumber(0));

        tableStat.hand = tableStat.hand.add(spentForGas);
        tableStat.player = tableStat.hand.add(spentForGas.div(Number(hand.playersCount)));
      }

      result[tableAddr] = {
        hand: tableStat.hand.div(tables[tableAddr].length),
        player: tableStat.player.div(tables[tableAddr].length),
      };
    }

    return result;
  }

}

function between(n, min, max) {
  return Number(n) >= min && Number(n) <= max;
}
