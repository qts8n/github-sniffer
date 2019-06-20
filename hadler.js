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
        try {
            records = JSON.parse(data);
        } catch (error) {
            records = [];
        }
        if (!Array.isArray(records)) {
            records = [];
        }
        callback(null, records);
    });
};

const addToWatchList = (record, responseHandler) => {
    refreshWatchList((error, records) => {
        if (error) return responseHandler(error);
        if (records.find(oldRecord => oldRecord.url === record.url))
            return responseHandler('Watch list record already exists');
        records.push(record);
        fs.writeFile(config.WATCH_LIST, JSON.stringify(records), config.ENCODING, console.error);
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
}

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
const removeUser = (url, responseHandler) => {
    refreshWatchList((error, records) => {
        if (error) return responseHandler(error);
        const filtered = records.filter(record => record.url !== url);
        fs.writeFile(config.WATCH_LIST, JSON.stringify(filtered), config.ENCODING, console.error);
    });
};

// Get full watchlist
const getWatchList = responseHandler => {
    refreshWatchList((error, records) => {
        if (error) return responseHandler(error);
        if (records.length === 0) return responseHandler('Current watchlist is empty!');
        let reply = 'Current watchlist:\n';
        records.forEach((record, it) => {
            reply += `${it + 1}. ${record.username}: ${record.url}\n`;
        });
        responseHandler(reply);
    });
}

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
        case '!add':
            msg.reply('Adding to watchlist...');
            break;
        case '!remove':
            msg.reply('Removing from watchlist...');
            break;
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
        const correspondingRepo = oldRepos.find(oldRepo => oldRepo.name === newRepo.name);
        // `correspondingRepo.updated_at` - old repo update date
        // `newRepo.updated_at` - new repo udate date
        if (moment(correspondingRepo.updated_at).isBefore(moment(newRepo.updated_at))) {
            updated.push(newRepo);
        }
    });

    return updated;
};

const notifyAboutUpdates = (channel, results) => {
    let notification = '@everyone, Updates since last check!\n';

    let it = 1;
    results.forEach(result => {
        result.updated.forEach(update => {
            notification += `${it}. ${result.username}'s ${update.name}: ${update.url}\n`;
            it++;
        });
    });
    channel.send(notification);
};

const checkForUpdates = client => {
    console.log('Schedule job started...')
    refreshWatchList((error, records) => {
        if (error) return console.error(error);
        let promises = [];
        records.forEach(record => {
            promises.push(getUserRepos(getUser(record.url)));
        });
        Promise.all(promises).then(users => {
            let results = [];
            let newRecords = [];
            users.forEach(resp => {
                const username = resp.data[0].owner.login;
                const currentRepos = formatGithubResponse(resp);
                const correspondingRecord = records.find(record => record.username === username);
                newRecords.push({
                    username,
                    url: correspondingRecord.url,
                    repos: currentRepos,
                    count: currentRepos.length
                });

                // `currentRepos` - new repos of `username`
                // `correspondingRecord.repos` - known (old) repos of `username`
                const updated = getUpdatedRepos(correspondingRecord.repos, currentRepos);
                if (updated.length !== 0) {
                    results.push({ username, updated });
                }
            });
            if (results.length !== 0) {
                console.log('Changes found...');
                notifyAboutUpdates(client.channels.get(config.CHANNEL_ID, results));
                fs.writeFile(config.WATCH_LIST, JSON.stringify(newRecords), config.ENCODING, console.error);
            }
            console.log('Schedule job done!');
        });
    });
};

exports.getUser = getUser;
exports.getUserRepos = getUserRepos;
exports.friendlyReply = friendlyReply;
exports.handleMessage = handleMessage;
exports.readWatchList = refreshWatchList;
exports.checkForUpdates = checkForUpdates;
