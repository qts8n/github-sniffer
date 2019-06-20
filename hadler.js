const fs = require('fs');
const axios = require('axios');
const config = require('./config');
const moment = require('moment');

class Interrupt extends Error {
    constructor(msg = 'Interrupted') {
        super(msg);
        this.interrupted = true;
    }
}

const refreshWatchList = callback => {
    fs.readFile(config.WATCH_LIST, config.ENCODING, (error, data) => {
        if (error) return callback('Can\'t read watch list', null);
        let records;
        try { records = JSON.parse(data); }
        catch (error) { records = []; }
        if (!Array.isArray(records)) records = [];
        callback(null, records);
    });
};

const saveRecords = records =>
    fs.writeFile(config.WATCH_LIST, JSON.stringify(records), config.ENCODING, console.error);

const manageWatchList = responseHandler => callback => {
    refreshWatchList((error, records) => {
        if (error) return responseHandler(error);
        callback(records);
    });
};

const addToWatchList = (record, responseHandler) => {
    manageWatchList(responseHandler)(records => {
        if (records.find(oldRecord => oldRecord.url === record.url))
            return responseHandler('Watch list record already exists');
        records.push(record);
        saveRecords(records);
    });
};

const getUser = url => url.split('/').slice(-1).pop();

const getUserRepos = username => axios.get(`${config.GITHUB_API}/users/${username}/repos`);

const formatGithubResponse = resp => {
    const repos = resp.data;
    let formatted = [];
    repos.forEach(repo => {
        formatted.push({
            id: repo.id,
            name: repo.name,
            updated_at: repo.updated_at,
            url: repo.svn_url,
        });
    });
    return formatted;
};

// Adding user to a watch list
const addUser = (url, responseHandler) => {
    const username = getUser(url);
    let record = { username, url, repos: [], count: 0 };
    getUserRepos(username)
        .then(resp => {
            const repos = formatGithubResponse(resp);
            record.count = repos.length;
            record.repos = repos;
            addToWatchList(record, responseHandler);
        })
        .catch(error => {
            console.error(error);
            responseHandler('Can\'t get repos');
        });
};

// Removing user from a watch list
const removeUser = (url, responseHandler) =>
    manageWatchList(responseHandler)(records => saveRecords(records.filter(r => r.url !== url)));

// Get full watchlist
const getWatchList = responseHandler => {
    manageWatchList(responseHandler)(records => {
        if (records.length === 0) return responseHandler('Current watchlist is empty!');
        responseHandler(records.reduce(
            (acc, r, it) => acc + `${it + 1}. ${r.username}: ${r.url}\n`,
            'Current watchlist:\n'
        ));
    });
};

// Bot allowed commands
const BOT_COMMANDS = {
    add: addUser,
    remove: removeUser
};

// Allowed links pattern
// Handles links like `https://github.com/qts8n`
const LINK_PATTERN = /^https\:\/\/github\.com\/[a-z0-9]+$/i;

// Handles user message
const handleMessage = (msg, responseHandler) => {
    if (!msg || typeof msg !== 'string') return;
    const allowed_cmd = Object.keys(BOT_COMMANDS);
    const words = msg.split(' ');
    const cmd = words[0].substr(1);
    if (!~allowed_cmd.indexOf(cmd) && cmd !== 'help') return;
    if (cmd === 'help' || words.length !== 2)
        return responseHandler(`USAGE:\n${allowed_cmd.join(' [URL]\n')} [URL]`);
    const url = words[1];
    if (!url.match(LINK_PATTERN))
        return responseHandler(`Can\'t handle URL: ${url}`);
    try {
        BOT_COMMANDS[cmd](url, responseHandler);
    } catch (error) {
        responseHandler(error);
    }
};

const friendlyReply = msg => {
    msg.content = (msg.content || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!msg.content.startsWith('!')) throw new Interrupt();
    const command = msg.content.split(' ')[0];
    switch (command) {
        case '!ping':
            msg.reply('Pong!');
            throw new Interrupt();
        case '!add': break;
        case '!remove': break;
        case '!list':
            getWatchList(msg.reply.bind(msg));
            throw new Interrupt();
        default:
            msg.reply('Processed!');
            break;
    }
};

const getUpdatedRepos = (oldRepos, newRepos) => {
    let updated = [];
    newRepos.forEach(newRepo => {
        const oldDate = oldRepos.find(oldRepo => oldRepo.name === newRepo.name).updated_at;
        const newDate = newRepo.updated_at;
        if (moment(oldDate).isBefore(newDate)) updated.push(newRepo);
    });
    return updated;
};

const notifyAboutUpdates = (channel, results) => {
    let notification = '@everyone, Updates since last check!\n';
    let it = 1;
    results.forEach(result => {
        result.updated.forEach(update => {
            notification += `${it}. ${result.username}-${update.name}: ${update.url}\n`;
            it++;
        });
    });
    channel.send(notification);
};

const checkForUpdates = client => {
    manageWatchList(console.error)(records => {
        let promises = [];
        records.forEach(record => {
            promises.push(getUserRepos(getUser(record.url)));
        });
        Promise.all(promises).then(users => {
            let results = [], newRecords = [];
            users.forEach(resp => {
                const username = resp.data[0].owner.login;
                const currentRepos = formatGithubResponse(resp);
                const record = records.find(record => record.username === username);
                newRecords.push({
                    username,
                    url: record.url,
                    repos: currentRepos,
                    count: currentRepos.length
                });
                const updated = getUpdatedRepos(record.repos, currentRepos);
                if (updated.length === 0) return;
                results.push({ username, updated });
            });
            if (results.length === 0) return;
            console.log('Updating records...');
            notifyAboutUpdates(client.channels.get(config.CHANNEL_ID, results));
            saveRecords(newRecords);
        }).catch(console.error);
    });
};

exports.getUser = getUser;
exports.getUserRepos = getUserRepos;
exports.friendlyReply = friendlyReply;
exports.handleMessage = handleMessage;
exports.readWatchList = refreshWatchList;
exports.checkForUpdates = checkForUpdates;
