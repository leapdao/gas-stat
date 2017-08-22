import Web3 from 'web3';
import Raven from 'raven';
import AWS from 'aws-sdk';
import doc from 'dynamodb-doc';

import Db from './src/db';
import Collector from './src/index';

let web3Provider;
const simpledb = new AWS.SimpleDB();
const dynamo = new doc.DynamoDB();

exports.handler = function handler(event, context, callback) {

  Raven.config(process.env.SENTRY_URL).install();

  if (event.Records && event.Records instanceof Array) {
    let web3;
    if (!web3Provider) {
      web3 = new Web3();
      web3Provider = new web3.providers.HttpProvider(process.env.PROVIDER_URL);
    }
    web3 = new Web3(web3Provider);


    let requests = [];
    const collector = new Collector(
      Raven,
      new Db(
        simpledb,
        dynamo,
        process.env.SDB_TABLE_NAME,
        process.env.DYNAMO_TABLE_NAME,
      ),
    );
    for (let i = 0; i < event.Records.length; i += 1) {
      requests = requests.concat(collector.process(event.Records[i].Sns));
    }
    Promise.all(requests).then((data) => {
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
  } else {
    console.log('Context received:\n', JSON.stringify(context)); // eslint-disable-line no-console
    callback(null, 'no action taken.');
  }
};
