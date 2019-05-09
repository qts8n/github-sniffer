// Testing bots here `https://discord.gg/xYVqcME`

const config = require('./config');
const discord = require('discord.js');
const handler = require('./hadler');
const schedule = require('node-schedule');
const client = new discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    // Every 55 minutes - check for updates
    const rule = new schedule.RecurrenceRule();
    rule.minute = 55;
    schedule.scheduleJob(rule, handler.checkForUpdates);
});

client.on('message', msg => {
    const content = (msg.content || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!content.startsWith('!')) return;
    if (content === '!ping') {
        msg.reply('Pong!');
        return;
    }
    const general = msg.channel.id;
    msg.reply('Processed');
    handler.handleMessage(content, msg.reply.bind(msg));
});

client.login(config.TOKEN);
