import { dbMethod, transform } from './utils';

const EMPTY_ADDR = '0x0000000000000000000000000000000000000000';

export default class Db {

  constructor(sdb, dynamo, sdbTableName, dynamoTableName) {
    this.sdb = sdb;
    this.dynamo = dynamo;
    this.sdbTableName = sdbTableName;
    this.dynamoTableName = dynamoTableName;
  }

  async getLastHand(tableAddr, scanForward) {
    const { Items } = await this.query({
      TableName: this.tableName,
      KeyConditionExpression: 'tableAddr = :a',
      ExpressionAttributeValues: { ':a': tableAddr },
      Limit: 1,
      ScanIndexForward: scanForward,
    });

    if (!Items || !Items[0]) {
      throw new Error(`Table ${tableAddr} doesn't exists`);
    }

    return Items[0];
  }

  async getHandsInRange(from, to) {
    const { Items = [] } = this.select({
      SelectExpression: `SELECT * FROM \`${this.sdbTableName}\` WHERE \`created\` >= '${from}' AND \`created\` <= '${to}' ORDER BY \`created\` ASC`,
    });

    return Items.map(item => transform(item.Attributes));
  }

  async addHand(tableAddr) {
    const lastHand = await this.getLastHand(tableAddr);
    const nextHandId = lastHand.handId + 1;
    this.putAttributes({
      DomainName: this.sdbTableName,
      ItemName: `${tableAddr}-${nextHandId}`,
      Attributes: [
        { Name: 'tableAddr', Value: tableAddr },
        { Name: 'handId', Value: String(nextHandId) },
        {
          Name: 'playersCount',
          Value: String(lastHand.filter(item => item.address !== EMPTY_ADDR).length),
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
