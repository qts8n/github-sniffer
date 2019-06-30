# github-sniffer
Discord bot for professional github sniffing `:^)`

## Deploying
For a successful deployment, make sure to follow these simple steps:
```bash
git clone <repo>
cd github-sniffer
npm i
cp lib/example.config.js lib/config.js
touch watchlist.json
```

After that you need to add your discord API token to the `lib/config.js` file. Also
bot will need a group chat id to spam messages to. Be a good boi and provide
that one in the `config.js` too `:^)`. You can also change the watchlist
filename and it's encoding as well as the scheduled tasks interval in mentioned
config file.

## Running
After a successful deployment you can run the server with the discord bot
interface by typing `npm run dev` to run nodemon or `npm run start` to run a
node server. Use `start` script as a default one and `dev` if you're testing
something. Also check `package.json`. To be sure your bot is always working, use
one of the (node) process managers or prefered daemons.
[PM2](http://pm2.keymetrics.io/) recommended.
