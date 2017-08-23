import Raven from 'raven';
import AWS from 'aws-sdk';
import doc from 'dynamodb-doc';
import request from 'request';
import Web3 from 'web3';

import Db from './src/db';
import Collector from './src/index';
import EtherScan from './src/etherscan';

const simpledb = new AWS.SimpleDB();
const dynamo = new doc.DynamoDB();

exports.handler = async function handler(event, context, callback) {
  try {
    Raven.config(process.env.SENTRY_URL).install();

    const web3 = new Web3();
    web3.setProvider(new web3.providers.HttpProvider(process.env.PROVIDER_URL));

    const collector = new Collector(
      Raven,
      new Db(
        simpledb,
        dynamo,
        process.env.SDB_TABLE_NAME,
        process.env.DYNAMO_TABLE_NAME,
      ),
      new EtherScan(
        request,
        process.env.ETHERSCAN_API_URL,
        process.env.ETHERSCAN_API_KEY,
      ),
      web3,
    );

    if (Array.isArray(event.Records)) {
      let requests = [];
      for (let i = 0; i < event.Records.length; i += 1) {
        requests = requests.concat(collector.processMessage(event.Records[i].Sns));
      }
      const data = await Promise.all(requests);
      return callback(null, data);
    } else if (event.context && event.context['resource-path']) {
      const path = event.context['resource-path'];

      if (path.indexOf('stat') > -1) {
        const stat = await collector.queryStat(
          process.env.ACCOUNT_ADDRESS,
        );

        return callback(null, stat);
      }
    }
  } catch (err) {
    Raven.captureException(err, { server_name: 'gas-stat' }, (sendErr) => {
      if (sendErr) {
        console.log(JSON.stringify(sendErr)); // eslint-disable-line no-console
        callback(sendErr);
        return;
      }
      callback(null, err);
    });
  }

  console.log('Context received:\n', JSON.stringify(context)); // eslint-disable-line no-console
  return callback(null, 'no action taken.');
};
