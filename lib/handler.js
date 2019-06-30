import axios from 'axios';
import moment from 'moment';
import { readFile, writeFile } from 'fs';
import { CHANNEL_ID, WATCH_LIST, ENCODING } from './config';

const LINK_PATTERN = /^https\:\/\/github\.com\/[a-z0-9]+$/i;
const GITHUB_API = 'https://api.github.com';

class Interrupt extends Error {
    constructor(msg = 'Interrupted') {
        super(msg);
        this.interrupted = true;
    }
}

const refreshWatchList = callback => readFile(WATCH_LIST, ENCODING, (error, data) => {
    if (error) return callback('Can\'t read watch list', null);
    let records;
    try { records = JSON.parse(data); }
    catch (error) { records = []; }
    if (!Array.isArray(records)) records = [];
    callback(null, records);
});

const saveRecords = records => writeFile(WATCH_LIST, JSON.stringify(records), ENCODING, e => e && console.error(e));

const manageWatchList = responseHandler => callback => refreshWatchList((error, records) => {
    if (error) return responseHandler(error);
    callback(records);
});

const addToWatchList = (record, responseHandler) => manageWatchList(responseHandler)(records => {
    if (records.find(oldRecord => oldRecord.url === record.url))
        return responseHandler('Watch list record already exists');
    records.push(record);
    saveRecords(records);
});

const getUser = url => url.split('/').slice(-1).pop();

const getUserRepos = username => axios.get(`${GITHUB_API}/users/${username}/repos`);

const formatGithubResponse = resp =>
    (resp.data || []).reduce((formatted, repo) => [...formatted, {
        id: repo.id,
        name: repo.name,
        updated_at: repo.updated_at,
        url: repo.svn_url,
    }], []);

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
        .catch(() => responseHandler('Can\'t get repos'));
};

// Removing user from a watch list
const removeUser = (url, responseHandler) =>
    manageWatchList(responseHandler)(records => saveRecords(records.filter(r => r.url !== url)));

// Get full watchlist
const getWatchList = responseHandler => manageWatchList(responseHandler)(records => {
    if (records.length === 0) return responseHandler('Current watchlist is empty!');
    responseHandler(records.reduce(
        (acc, r, it) => acc + `${it + 1}. ${r.username}: ${r.url}\n`,
        'Current watchlist:\n'
    ));
});

// Bot allowed url-commands
const URL_HANDLERS = { add: addUser, remove: removeUser };

// Handles user message with url in it
export const handleUrl = (msg, responseHandler) => {
    if (!msg || typeof msg !== 'string') return;
    const allowed_cmd = Object.keys(URL_HANDLERS);
    const words = msg.split(' ');
    const cmd = words[0].substr(1);
    if (!~allowed_cmd.indexOf(cmd) && cmd !== 'help') return;
    if (cmd === 'help' || words.length !== 2)
        return responseHandler(`USAGE:\n${allowed_cmd.join(' [URL]\n')} [URL]`);
    const url = words[1];
    if (!url.match(LINK_PATTERN))
        return responseHandler(`Can\'t handle URL: ${url}`);
    try { URL_HANDLERS[cmd](url, responseHandler); }
    catch (error) { responseHandler(error); }
};

export const handleMessage = msg => {
    msg.content = (msg.content || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!msg.content.startsWith('!')) throw new Interrupt();
    const command = msg.content.split(' ')[0];
    switch (command) {
        case '!ping': msg.reply('Pong!'); throw new Interrupt();
        case '!list': getWatchList(msg.reply.bind(msg)); throw new Interrupt();
        case '!check': checkForUpdates(msg.client); throw new Interrupt();
        case '!add': msg.reply('Adding to watchlist...'); break;
        case '!remove': msg.reply('Removing from watchlist...'); break;
        default: break;
    }
};

const getUpdatedRepos = (oldRepos, newRepos) => {
    let updated = [];
    newRepos.forEach(newRepo => {
        const corresponding = oldRepos.find(oldRepo => oldRepo.name === newRepo.name);
        if (!corresponding) return updated.push(newRepo);
        const oldDate = corresponding.updated_at;
        const newDate = newRepo.updated_at;
        if (moment(oldDate).isBefore(newDate)) updated.push(newRepo);
    });
    return updated;
};

const notifyAboutUpdates = (channel, results) => {
    let notification = '@everyone, Updates since last check!\n', it = 1;
    results.forEach(result => result.updated.forEach(update =>
        notification += `${it++}. ${result.username} - \`${update.name}\`: ${update.url}\n`));
    channel.send(notification);
};

export const checkForUpdates = client => manageWatchList(console.error)(records => {
    let promises = [];
    records.forEach(record => promises.push(getUserRepos(getUser(record.url))));
    Promise.all(promises).then(users => {
        let results = [], newRecords = [];
        users.forEach(resp => {
            const username = resp.data[0].owner.login;
            const repos = formatGithubResponse(resp);
            const record = records.find(record => record.username === username);
            newRecords.push({ username, url: record.url, repos, count: repos.length });
            const updated = getUpdatedRepos(record.repos, repos);
            if (updated.length === 0) return;
            results.push({ username, updated });
        });
        const channel = client.channels.get(CHANNEL_ID);
        if (results.length === 0) return channel.send('@everyone, There was no updates since last check');
        console.log('Updating records...');
        notifyAboutUpdates(channel, results);
        saveRecords(newRecords);
    }).catch(console.error);
});
