/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('emails', table => {
        table.increments('id').primary();
        table.text('to');
        table.text('cc');
        table.text('bcc');
        table.string('subject');
        table.text('body');
        table.timestamps(true, true);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('emails');
};
