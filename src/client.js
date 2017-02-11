const Promise = require('bluebird');
const path = require('path');
const iMessageSend = require('./imessage-send');
const iMessageSendGroup = require('./imessage-send-group');
const EventEmitter = require('events').EventEmitter;
const queue = require('queue');
const chokidar = require('chokidar');
const HOME = require('os').homedir();
const moment = require('moment');
const TR = require('./transcript-reader');
const nodePersist = require('node-persist');

/**
 * A real hack of an iMessage client.
 *
 * Receiving works by watching the file system,
 * so expect a small delay since Messages.app
 * does not write to the FS immediately.
 *
 * Sending works by AppleScript
 */
class Client extends EventEmitter {
  sendMessage (id, service, text, file) {
    return iMessageSend(id, service != "iMessage" ? "sms" : "iMessage", text, file);
  }
  sendGroupMessage (handles, text, file) {
    return iMessageSendGroup(handles, text, file);
  }
  init (ichatArchives) {
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
                    this.emit('message', Object.assign({}, {
                      fileRecipient
                    }, msg));
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
                const reader = TR(filepath);
                reader.getMessages().then(messages => {
                  return Promise.mapSeries(messages, (msg) =>{
                    console.log('marking skip [initial scan]: ', path.basename(filepath), msg.sender, msg.message);
                    return storage.setItem(msg.hash, {skip: true});
                  });
                }).catch(err=>{
                  console.error(err);
                }).finally(cb);
              });
            }
          }
        };

        let ready = false;
        const watcherOptions = { persistent: true, ignoreInitial: false };
        const watcher = chokidar.watch(ichatArchives.replace(/^~/, HOME), watcherOptions);
        watcher.on('add', processFile);
        watcher.on('change', processFile);
        watcher.on('ready', () => {
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
}

module.exports = Client;
