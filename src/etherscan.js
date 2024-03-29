import qs from 'qs';

export default class EtherScan {

  constructor(request, apiUrl, apiKey) {
    this.requestFn = request;
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  getAccountTransactions(accountAddress, fromBlock, toBlock) {
    const headers = {
      'Content-Type': 'application/json',
    };

    const params = qs.stringify({
      module: 'account',
      action: 'txlist',
      address: accountAddress,
      sort: 'asc',
      apikey: this.apiKey,
      startblock: fromBlock,
      endblock: toBlock,
    });

    return this.request({
      url: `${this.apiUrl}?${params}`,
      method: 'POST',
      headers,
    }).then(r => JSON.parse(r));
  }

  request(options) {
    return new Promise((resolve, reject) => {
      this.requestFn(options, (error, response, body) => {
        if (error || response.statusCode !== 200) {
          return reject({ error, status: response.statusCode });
        }
        return resolve(body);
      });
    });
  }

}
