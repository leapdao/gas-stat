import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
// import { Receipt } from 'poker-helper';
import { it, describe, afterEach } from 'mocha';

import Collector from './src/index';
import Db from './src/db';
import EtherScan from './src/etherscan';

chai.use(sinonChai);

const sentry = {
  captureMessage() {
  },
  captureException() {
  },
};

const dynamo = {
  getItem() {},
  putItem() {},
  query() {},
  updateItem() {},
  deleteItem() {},
};

const sdb = {
  getAttributes() {},
  putAttributes() {},
  deleteAttributes() {},
  select() {},
};

const http = {
  request() {},
};

const web3 = {
  eth: {
    blockNumber: 100500,
  },
};

const now = Math.round(Date.now() / 1000);

describe('Collector', () => {
  it('should return stat for account', async () => {
    const TABLE_ADDR_1 = '0x0000000001';
    const TABLE_ADDR_2 = '0x0000000002';
    sinon.stub(sdb, 'select').yields(null, {
      Items: [
        {
          Attributes: [
            { Name: 'handId', Value: '1' },
            { Name: 'tableAddr', Value: TABLE_ADDR_1 },
            { Name: 'playersCount', Value: '2' },
            { Name: 'created', Value: String(now - (60 * 60 * 12)) },
          ],
        },
        {
          Attributes: [
            { Name: 'handId', Value: '2' },
            { Name: 'tableAddr', Value: TABLE_ADDR_1 },
            { Name: 'playersCount', Value: '3' },
            { Name: 'created', Value: String(now - (60 * 60 * 6)) },
          ],
        },
        {
          Attributes: [
            { Name: 'handId', Value: '1' },
            { Name: 'tableAddr', Value: TABLE_ADDR_2 },
            { Name: 'playersCount', Value: '3' },
            { Name: 'created', Value: String(now - (60 * 60 * 2)) },
          ],
        },
        {
          Attributes: [
            { Name: 'handId', Value: '2' },
            { Name: 'tableAddr', Value: TABLE_ADDR_2 },
            { Name: 'playersCount', Value: '2' },
            { Name: 'created', Value: String(now - (60 * 60)) },
          ],
        },
      ],
    });
    sinon.stub(http, 'request').yields(null, { statusCode: 200 }, JSON.stringify({
      result: [
        {
          timeStamp: now - (60 * 60 * 10),
          to: TABLE_ADDR_1,
          gas: '200000',
          gasPrice: '20000000000',
          gasUsed: '21000',
        },
        {
          timeStamp: now - (60 * 60 * 9),
          to: TABLE_ADDR_1,
          gas: '200000',
          gasPrice: '20000000000',
          gasUsed: '22000',
        },
        {
          timeStamp: now - (60 * 60),
          to: TABLE_ADDR_1,
          gas: '200000',
          gasPrice: '20000000000',
          gasUsed: '200000',
        },
        {
          timeStamp: now - (60 * 30),
          to: TABLE_ADDR_2,
          gas: '200000',
          gasPrice: '20000000000',
          gasUsed: '68091',
        },
        {
          timeStamp: now - (60 * 70),
          to: TABLE_ADDR_2,
          gas: '500000',
          gasPrice: '20000000000',
          gasUsed: '87911',
        },
        {
          timeStamp: '1500554560',
          to: TABLE_ADDR_2,
          gas: '500000',
          gasPrice: '20000000000',
          gasUsed: '500000',
        },
        {
          timeStamp: '1500554560',
          to: '0xc30eef95351865cb5e5226aab1615fe9dfc9ce84',
          gas: '200000',
          gasPrice: '20000000000',
          gasUsed: '51072',
        },
        {
          timeStamp: now - (60 * 60 * 30),
          to: TABLE_ADDR_1,
          gas: '200000',
          gasPrice: '20000000000',
          gasUsed: '51072',
        },
      ],
    }));

    const collector = new Collector(
      sentry,
      new Db(sdb, dynamo, 'statTable', 'pokerTable'),
      new EtherScan(http.request, 'http://api', 'key'),
      web3,
    );

    const stat = await collector.queryStat(
      '0x',
      now - (60 * 60 * 24),
      now + 10,
    );

    expect(Object.keys(stat).length).eq(2);
    expect(stat[TABLE_ADDR_1].hand).eq(0.00243);
    expect(stat[TABLE_ADDR_2].hand).eq(0.00156002);
    expect(stat[TABLE_ADDR_1].player).eq(0.0008816666666666667);
    expect(stat[TABLE_ADDR_2].player).eq(0.0006334916666666667);
  });

  it('should process HandComplete message', async () => {
    const message = {
      Subject: 'HandComplete::0x0000000001',
    };

    sinon.stub(sdb, 'putAttributes').yields(null, {});
    sinon.stub(dynamo, 'query').yields(null, {
      Items: [
        {
          tableAddr: '0x0000000001',
          handId: '1',
          lineup: [
            { address: '0xaaaabbbbccc' },
            { address: '0x0000000000000000000000000000000000000000' },
            { address: '0x0000000000000000000000000000000000000000' },
            { address: '0x0000000000000000000000000000000000000000' },
          ],
        },
      ],
    });

    const collector = new Collector(
      sentry,
      new Db(sdb, dynamo, 'statTable', 'pokerTable'),
      new EtherScan(http.request, 'http://api', 'key'),
      web3,
    );

    await Promise.all(collector.processMessage(message));

    expect(sdb.putAttributes).callCount(1);
    expect(sdb.putAttributes).calledWith({
      DomainName: 'statTable',
      ItemName: '0x0000000001-2',
      Attributes: [
        { Name: 'tableAddr', Value: '0x0000000001' },
        { Name: 'handId', Value: '2' },
        { Name: 'playersCount', Value: '1' },
        { Name: 'created', Value: String(Math.round(Date.now() / 1000)) },
      ],
    });
  });

  afterEach(() => {
    if (sdb.select.restore) sdb.select.restore();
    if (dynamo.query.restore) dynamo.query.restore();
    if (http.request.restore) http.request.restore();
  });
});
