const fs = require('fs');
const axios = require('axios');
const config = require('./config');

const refreshWatchList = callback => {
    fs.readFile(config.WATCH_LIST, config.ENCODING, (error, data) => {
        if (error) {
            callback('Can\'t read watch list', null);
            return;
        }
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
}

const addToWatchList = (record, responseHandler) => {
    refreshWatchList((error, records) => {
        if (error) {
            responseHandler(error);
            return;
        }
        if (records.find(oldRecord => oldRecord.url === record.url)) {
            responseHandler('Watch list record already exists');
            return;
        }
        records.push(record);
        fs.writeFile(
            config.WATCH_LIST,
            JSON.stringify(records),
            config.ENCODING,
            console.error
        );
    });
}

const getUser = url => url.split('/').slice(-1).pop();

const getUserRepos = username => {
    return axios.get(`${config.GITHUB_API}/users/${username}/repos`);
}

// Adding user to a watch list
const addUser = (url, responseHandler) => {
    const username = getUser(url);
    let record = { username, url, repos: [], count: 0 };
    getUserRepos(username)
        .then(resp => {
            const repos = resp.data;
            record.count = repos.length;
            repos.forEach(repo => {
                record.repos.push({
                    id: repo.id,
                    name: repo.name,
                    updated_at: repo.updated_at,
                    url: repo.svn_url,
                });
            });
            addToWatchList(record, responseHandler);
        })
        .catch(error => {
            console.error(error);
            responseHandler('Can\'t get repos');
        });
}

// Removing user from a watch list
const removeUser = (url, responseHandler) => {
    refreshWatchList((error, records) => {
        if (error) {
            responseHandler(error);
            return;
        }
        const filtered = records.filter(record => record.url !== url);
        fs.writeFile(
            config.WATCH_LIST,
            JSON.stringify(filtered),
            config.ENCODING,
            console.error
        );
    });
}

// Bot allowed commands
const BOT_COMMANDS = {
    add: addUser,
    remove: removeUser,
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
    if (cmd === 'help' || words.length !== 2) {
        responseHandler(`USAGE:\n${allowed_cmd.join(' [URL]\n')} [URL]`);
        return;
    }
    const url = words[1];
    if (!url.match(LINK_PATTERN)) {
        responseHandler(`Can\'t handle URL: ${url}`);
        return;
    }
    try {
        BOT_COMMANDS[cmd](url, responseHandler);
    } catch (error) {
        responseHandler(error);
    }
}

const checkForUpdates = () => {
    refreshWatchList((error, records) => {
        if (error) console.error(error);
        let promises = [];
        records.forEach(record => {
            const username = getUser(record.url);
            promises.push(getUserRepos(username));
        });
        Promise.all(promises).then(userRepos => {
            // recors - stored user repos
            // userRepos - current user repos
            // TODO: find differences send to discord
        });
    });
}

exports.getUser = getUser;
exports.getUserRepos = getUserRepos;
exports.handleMessage = handleMessage;
exports.readWatchList = refreshWatchList;
exports.checkForUpdates = checkForUpdates;
