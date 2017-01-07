const path = require('path');
const Promise = require('bluebird');
const queue = require('queue');
const chokidar = require('chokidar');
const HOME = require('os').homedir();
const moment = require('moment');
const TR = require('./src/transcript-reader');
const iMessageSend = require('./src/imessage-send');

const config = require('./config.json');
const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const nodePersist = require('node-persist');


class App extends MatrixPuppetBridgeBase {
  // return a promise that resolves when you are ready to start
  // serving new events from third party service
  initThirdPartyClient() {
    this.roomNames = {};
    const storage = nodePersist.create({
      dir:'persist/messages',
      stringify: JSON.stringify,
      parse: JSON.parse,
      encoding: 'utf8',
      logging: false,
      continuous: true,
      interval: false,
      ttl: '24h'
    });
    this.storage = storage;

    const q = queue();
    q.timeout = 500;
    q.concurrency = 1; // number of ichat2json subprocesses you are willing to spawn at once

    return storage.init().then(() => {
      return new Promise((resolve, _reject) => {
        /** 
         * Basic algorithm for process() function:
         *
         * on start
         * for files in today's folder
         * mark each message with skip
         * 
         * on file change or add
         * go thru each message
         * if skip, do nothing
         * if not skip, do relay, mark as skip
         */
        const processFile = (filepath) => {
          console.log('processFile', filepath);
          var parts = filepath.split(path.sep);
          var len = parts.length;
          let [ dateString ] = parts.slice(len-2, len-1);
          var filename = parts[len-1];
          let [ fileRecipient ] = filename.split(" on ");
          //console.log("File recipient: " + fileRecipient);

          var today = moment().format('YYYY-MM-DD');

          if ( ready ) {
            // go thru each msg, if skip noop, else relay+skip
            TR(filepath).getMessages().map(msg => {

              const processMessage = (msg) => {
                return storage.getItem(msg.hash).then((meta) => {
                  let shouldSkip = meta && meta.skip;
                  let shouldRelay = !shouldSkip;
                  if (shouldRelay) {
                    const { hash, isMe, message, sender, subject, service } = msg;
                    const roomId = isMe ? subject : sender;
                    this.roomNames[roomId] = fileRecipient;

                    // let's remember the service so we can use that to respond
                    // this is either SMS or iMessage
                    return this.storage.setItem(roomId+':service', service).then(() => {
                      return this.handleThirdPartyRoomMessage({
                        roomId,
                        messageId: hash,
                        senderName: fileRecipient,
                        senderId: isMe ? undefined : roomId,
                        text: message
                      });
                    });

                  } else {
                    console.log('skiping message: ', msg.sender, msg.message);
                  }
                })
                  .then(()=>{
                    console.log('marking skip: ', msg.hash, msg.sender, msg.message);
                    return storage.setItem(msg.hash, {skip: true});
                  })
                  .catch((err)=>{
                    // poor man's retry
                    console.log(err, 'retrying soon');
                    setTimeout(()=> processMessage(msg), 5000);
                  });
              };

              return processMessage(msg);
            });
          } else {
            if (dateString === today) {
              // foreach, mark skip
              q.push(function(cb) {
                TR(filepath).getMessages().map(msg => {
                  console.log('marking skip [initial scan]: ', path.basename(filepath), msg.sender, msg.message);
                  return storage.setItem(msg.hash, {skip: true});
                }).catch(console.error).finally(cb);
              });
            }
          }
        };

        let ready = false;
        const watcherOptions = { persistent: true, ignoreInitial: false };
        config.ichatArchives = config.ichatArchives.replace(/^~/, HOME);
        const watcher = chokidar.watch(config.ichatArchives, watcherOptions);
        watcher.on('add', processFile);
        watcher.on('change', processFile);
        watcher.on('ready', () => {
          console.log("we get here?");
          q.on('end', function() {
            ready = true;
            console.log('ready');
            resolve();  // let the bridge start up

          });
          q.start();
        });
      });
    });
  }
  defaultDeduplicationTag() {
    // https://en.wikipedia.org/wiki/Whitespace_character
    //return " \u2063";
    //return " \u1680"; // Produces a --
    //return " \u0017"; // ETB Doesn't work
    //return " \u2000"; // Shows a space in everything i've tried it with, which is fine.
    return " \ufeff"; // Zero width non-breaking space
  }
  defaultDeduplicationTagPattern() {
    // https://en.wikipedia.org/wiki/Whitespace_character
    //return " \\u2063$";
    //return " \\u1680$"; // Produces a --
    //return " \\u0017$"; // ETB Doesn't work
    //return " \\u2000$"; // Shows a space in everything i've tried it with, which is fine.
    return " \\ufeff$"; // Zero width non-breaking space
  }
  getServicePrefix() {
    return "imessage";
  }
  getThirdPartyRoomDataById(id) {
    return Promise.resolve({
      name: this.roomNames[id],
      topic: 'iMessage'
    });
  }
  getThirdPartyRoomIdFromMatrixRoomId(id) {
    const room = this.puppet.getClient().getRoom(id);
    const aliases = room.getAliases();
    for (var i in aliases) {
      var matches = aliases[i].match(/^#imessage_(.+):/);
      if ( matches ) {
        var msgId = matches[1];
        return msgId;
      }
    }
    return null;
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.storage.getItem(id+':service').then(service => {
      return iMessageSend(id, text, service != "iMessage" ? "sms" : "iMessage");
    });
  }
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("imessagebot");
      reg.addRegexPattern("users", "@imessage_.*", true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    const app = new App(config, puppet);
    return puppet.startClient().then(()=>{
      return app.initThirdPartyClient();
    }).then(() => {
      return app.bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();
