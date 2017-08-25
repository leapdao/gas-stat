import { dbMethod, transform } from './utils';

export default class Db {

  constructor(sdb, dynamo, sdbTableName, dynamoTableName) {
    this.sdb = sdb;
    this.dynamo = dynamo;
    this.sdbTableName = sdbTableName;
    this.dynamoTableName = dynamoTableName;

    // this.createDomain({
    //   DomainName: this.sdbTableName,
    // });
  }

  async getLastHand(tableAddr, scanForward) {
    const data = await this.query({
      TableName: this.dynamoTableName,
      KeyConditionExpression: 'tableAddr = :a',
      ExpressionAttributeValues: { ':a': tableAddr },
      ScanIndexForward: scanForward,
    });

    const items = (data.Items || []).sort((a, b) => Number(b.changed) - Number(a.changed));

    if (items.length === 0) {
      throw new Error(`Table ${tableAddr} doesn't exists`);
    }

    return items[0];
  }

  async getHandsInRange(from, to) {
    const { Items = [] } = await this.select({
      SelectExpression: `SELECT * FROM \`${this.sdbTableName}\` WHERE \`created\` >= '${from}' AND \`created\` <= '${to}' ORDER BY \`created\` ASC`,
    });

    return Items.map(item => transform(item.Attributes));
  }

  async addHand(tableAddr, handId, playersCount) {
    return this.putAttributes({
      DomainName: this.sdbTableName,
      ItemName: `${tableAddr}-${handId}`,
      Attributes: [
        { Name: 'tableAddr', Value: tableAddr },
        { Name: 'handId', Value: String(handId) },
        {
          Name: 'playersCount',
          Value: String(playersCount),
        },
        { Name: 'created', Value: String(Math.round(Date.now() / 1000)) },
      ],
    });
  }

  query(params) {
    return dbMethod(this.dynamo, 'query', params);
  }

  putAttributes(params) {
    return dbMethod(this.sdb, 'putAttributes', params);
  }

  select(params) {
    return dbMethod(this.sdb, 'select', params);
  }

  getAttributes(params) {
    return dbMethod(this.sdb, 'getAttributes', params);
  }

  deleteAttributes(params) {
    return dbMethod(this.sdb, 'deleteAttributes', params);
  }

  createDomain(params) {
    return dbMethod(this.sdb, 'createDomain', params);
  }

}
