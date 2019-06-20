// Testing bots here `https://discord.gg/xYVqcME`

const config = require('./config');
const discord = require('discord.js');
const handler = require('./hadler');
const schedule = require('node-schedule');
const client = new discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
    try {
        handler.friendlyReply(msg);
    } catch (err) {
        if (!err.interrupted) throw err;
        return;
    }
    handler.handleMessage(msg.content, msg.reply.bind(msg));
});

client.login(config.TOKEN);

const rule = new schedule.RecurrenceRule();
rule.minute = config.MINUTE_INTERVAL;
schedule.scheduleJob(rule, handler.checkForUpdates.bind(this, client));
