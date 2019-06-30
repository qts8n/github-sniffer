// Testing bots here `https://discord.gg/xYVqcME`

import { Client } from 'discord.js';
import { TOKEN, MINUTE_INTERVAL } from './config';
import { RecurrenceRule, scheduleJob } from 'node-schedule';
import { handleMessage, handleUrl, checkForUpdates } from './handler';

const client = new Client();
client.on('ready', () => console.log(`Logged in as ${client.user.tag}!`));

client.on('message', msg => {
    try {
        handleMessage(msg);
    } catch (err) {
        if (!err.interrupted) throw err;
        return;
    }
    handleUrl(msg.content, msg.reply.bind(msg));
});

client.login(TOKEN);

const rule = new RecurrenceRule();
rule.minute = MINUTE_INTERVAL;
scheduleJob(rule, checkForUpdates.bind(this, client));
