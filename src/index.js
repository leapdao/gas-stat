import _ from 'lodash';
import BigNumber from 'bignumber.js';

const EMPTY_ADDR = '0x0000000000000000000000000000000000000000';
const ETH_DECIMALS = new BigNumber(10).pow(18);

export default class Collector {

  constructor(sentry, db, etherScan, web3) {
    this.sentry = sentry;
    this.db = db;
    this.etherScan = etherScan;
    this.web3 = web3;
  }

  processMessage(message) {
    const tasks = [];

    if (!message.Subject || message.Subject.split('::').length < 2) {
      return [Promise.resolve(`unknown message type: ${message.Subject}`)];
    }

    try {
      // const msgBody = (
      //   (message.Message && message.Message.length > 0)
      //     ? JSON.parse(message.Message)
      //     : ''
      // );
      const [msgType, msgArg] = message.Subject.split('::');

      // console.log(msgBody);

      if (msgType === 'HandComplete') {
        tasks.push(this.handleNewHand(msgArg));
      }
    } catch (e) {
      return [Promise.resolve(`json parse error: ${JSON.stringify(e)}`)];
    }


    return tasks;
  }

  async handleNewHand(tableAddr) {
    const lastHand = await this.db.getLastHand(tableAddr, true);
    // await this.log('Write Stat Hand', {
    //   tags: { tableAddr },
    //   extra: {
    //     lastHandId: lastHand.handId,
    //   },
    // });

    return this.db.addHand(
      tableAddr,
      Number(lastHand.handId) + 1,
      lastHand.lineup.filter(item => item.address !== EMPTY_ADDR).length,
    );
  }

  async queryStat(accountAddress) {
    const blockNumber = await this.getBlockNumber();
    const { result: transactions } = await this.etherScan.getAccountTransactions(
      accountAddress,
      blockNumber - (4 * 60 * 24),
      blockNumber,
    );

    if (transactions.length === 0) {
      return {};
    }

    const now = Math.round(Date.now() / 1000);
    const hands = await this.db.getHandsInRange(Number(transactions[0].timeStamp), now);
    const tables = _.groupBy(hands, 'tableAddr');
    const tableAddrs = Object.keys(tables);

    return tableAddrs.reduce((result, tableAddr) => {
      const tableTransactions = transactions.filter(tx => tx.to === tableAddr);
      const tableStat = tables[tableAddr].reduce(
        tableStatReducer(now, tableTransactions),
        { hand: new BigNumber(0), player: new BigNumber(0) },
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

  log(message, context) {
    const cntxt = (context) || {};
    cntxt.level = (cntxt.level) ? cntxt.level : 'info';
    cntxt.server_name = 'gas-stat';
    return new Promise((resolve, reject) => {
      const now = Math.floor(Date.now() / 1000);
      this.sentry.captureMessage(`${now} - ${message}`, cntxt, (error, eventId) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(eventId);
      });
    });
  }

  getBlockNumber() {
    return new Promise((resolve, reject) => {
      this.web3.eth.getBlockNumber((err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
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
