const migration001 = require('./001_initial_schema');
const migration002 = require('./002_add_schedules');
const migration003 = require('./003_task_extensions');

module.exports = [migration001, migration002, migration003];
