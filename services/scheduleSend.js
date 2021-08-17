const schedule = require('node-schedule');

const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = [0, new schedule.Range(0, 6)];
rule.hour = 17;
rule.minute = 12;
rule.tz = 'Asia/Ho_Chi_Minh';
const job = schedule.scheduleJob(rule, function(){
  console.log('Hello!');
});