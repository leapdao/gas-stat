import Raven from 'raven';
import AWS from 'aws-sdk';
import doc from 'dynamodb-doc';
import request from 'request';

import Db from './src/db';
import Collector from './src/index';
import EtherScan from './src/etherscan';

const simpledb = new AWS.SimpleDB();
const dynamo = new doc.DynamoDB();

exports.handler = function handler(event, context, callback) {
  Raven.config(process.env.SENTRY_URL).install();

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
  );

  if (Array.isArray(event.Records)) {
    let requests = [];
    for (let i = 0; i < event.Records.length; i += 1) {
      requests = requests.concat(collector.process(event.Records[i].Sns));
    }
    return Promise.all(requests).then((data) => {
      callback(null, data);
    }).catch((err) => {
      Raven.captureException(err, { server_name: 'event-worker' }, (sendErr) => {
        if (sendErr) {
          console.log(JSON.stringify(sendErr)); // eslint-disable-line no-console
          callback(sendErr);
          return;
        }
        callback(null, err);
      });
    });
  } else if (event.context && event.context['resource-path']) {
    const path = event.context['resource-path'];

    if (path.indexOf() > -1) {
      return collector.queryStat(
        process.env.ACCOUNT_ADDRESS,
        event['body-json'].from,
        event['body-json'].to,
      );
    }
  }

  console.log('Context received:\n', JSON.stringify(context)); // eslint-disable-line no-console
  return callback(null, 'no action taken.');
};
