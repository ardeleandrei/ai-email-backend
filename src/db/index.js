const knex = require('knex')({
  client: 'sqlite3', // or 'better-sqlite3'
  connection: {
    filename: './db.sqlite',
  },
});

class DB {
  static async addLead(data) {
    return knex('leads').insert(data);
  }
}
