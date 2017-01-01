const path = require('path');
const crypto = require('crypto');
const spawn = require('child_process').spawn;
const Promise = require('bluebird');
const JSONStream = require('JSONStream');
const queue = require('queue');
const chokidar = require('chokidar');
const HOME = require('os').homedir();
const moment = require('moment');
const sms = 'service "SMS"';
const imessage = '(service 1 whose service type is iMessage)';

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

const ichat2json = path.join(__dirname, 'bin', 'ichat2json');
const createHash = (input) => 
  crypto.createHash('md5').update(input).digest("hex")

const normalize = ({message, date, sender, subject, service}) => ({
  hash: createHash(message+date+sender+subject+service),
  isMe: sender.match(/^e:/),
  message, date, sender, subject, service
})

const TR = function(ichatFilePath) {
  return {
    getMessages: () => {
      return new Promise(function(resolve, reject) {
        var messages = [];
        var errors = [];
        var proc = spawn(ichat2json, [ichatFilePath]);
        proc.stdout
          .pipe(JSONStream.parse())
          .on('data', msg => messages.push(normalize(msg)))
        proc.stderr
          .on('data', data => errors.push(data.toString()))
        proc.on('exit', function(status) {
          if (status != 0) {
            reject(errors.join());
          } else {
            resolve(messages);
          }
        });
      });
    }
  }
}

const escapeString = (str) => {
  return str.replace(/[\\"]/g, '\\$&')
}

const iMessageSend = function(to, _message, _method) {
  let method = _method === 'sms' ? sms : imessage;
  let message =  escapeString(_message);
  console.log('escaped to', message);
  let args = ['-e'];

  // If string contains letters, it must be a contact name so
  // find the relevant phone number first
  if (/[a-z]/i.test(to)) {
    args.push(`tell application "Contacts"
    set i to value of phone 1 of (person 1 whose name = "${to}")
    end tell
    tell application "Messages"
    send "${message}" to buddy i of ${method}
    end tell`);
  } else {
    args.push(`tell application "Messages"
    send "${message}" to buddy "${to}" of ${method}
    end tell`);
  }
  console.log('full applescript', args[1]);

  return new Promise(function(resolve, reject) {
    // Check user input
    if (!to) reject(new Error('You didn\'t enter a recipient!'));
    else if (!message) reject(new Error('You didn\'t enter a message!'));
    else {
      var proc = spawn('/usr/bin/osascript', args );
      proc.stdout.pipe(process.stdout);
      proc.stderr.pipe(process.stderr);
      proc.on('exit', function(exitCode)  {
        if (exitCode != 0)  {
          reject(new Error('exited nonzero'));
        } else {
          resolve('SENT')
        }
      })
    }
  });
}

class App extends MatrixPuppetBridgeBase {
  // return a promise that resolves when you are ready to start
  // serving new events from third party service
  initThirdPartyClient() {
    this.roomNames = {};

    // XXX DEBUG
    //setTimeout(() =>{
    //  this.getOrCreateMatrixRoomFromThirdPartyRoomId('+19498875144');
    //}, 1000);

    const storage = nodePersist.create({
      dir:'persist/messages',
      stringify: JSON.stringify,
      parse: JSON.parse,
      encoding: 'utf8',
      logging: false,
      continuous: true,
      interval: false,
      ttl: '24h'
    })
    this.storage = storage;

    const q = queue();
    q.timeout = 500;
    q.concurrency = 1; // number of ichat2json subprocesses you are willing to spawn at once

    return storage.init().then(() => {
      return new Promise((resolve, reject) => {
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
          console.log('processFile', filepath)
          var parts = filepath.split(path.sep);
          var len = parts.length;
          let [ dateString ] = parts.slice(len-2, len-1);
          var filename = parts[len-1];
          let [ fileRecipient ] = filename.split(" on ");
          //console.log("File recipient: " + fileRecipient);

          var today = moment().format('YYYY-MM-DD')

          if ( ready ) {
            // go thru each msg, if skip noop, else relay+skip
            TR(filepath).getMessages().map(msg => {

              const processMessage = (msg) => {
                return storage.getItem(msg.hash).then((meta) => {
                  let shouldSkip = meta && meta.skip;
                  let shouldRelay = !shouldSkip;
                  if (shouldRelay) {
                    const { hash, isMe, message, date, sender, subject, service } = msg;
                    const roomId = isMe ? subject : sender;
                    this.roomNames[roomId] = fileRecipient;

                    // let's remember the service so we can use that to respond
                    // this is either SMS or iMessage
                    return this.storage.setItem(roomId+':service', service).then(() => {
                      return this.handleThirdPartyRoomMessage({
                        thirdParty: {
                          roomId,
                          messageId: hash,
                          senderName: fileRecipient,
                          senderId: isMe ? undefined : roomId,
                        },
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
                  })
              }

              return processMessage(msg);
            })
          } else {
            if (dateString === today) {
              // foreach, mark skip
              q.push(function(cb) {
                TR(filepath).getMessages().map(msg => {
                  console.log('marking skip [initial scan]: ', path.basename(filepath), msg.sender, msg.message);
                  return storage.setItem(msg.hash, {skip: true})
                }).catch(console.error).finally(cb);
              });
            }
          }
        }

        let ready = false;
        const watcherOptions = { persistent: true, ignoreInitial: false }
        console.log("2laksdfj " + config.ichatArchives);
        config.ichatArchives = config.ichatArchives.replace(/^~/, HOME);
        const watcher = chokidar.watch(config.ichatArchives, watcherOptions);
        console.log("4laksdfj");
        watcher.on('add', processFile);
        watcher.on('change', processFile);
        watcher.on('ready', () => {
          console.log("we get here?");
          q.on('end', function() {
            ready = true
            console.log('ready');
            resolve();  // let the bridge start up

          });
          q.start();
        });

      });
    })
  }
  defaultDeduplicationTag() {
    return "\u2063";
  }
  defaultDeduplicationTagPattern() {
    return "\\u2063$";
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
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.storage.getItem(id+':service').then(service => {
      return iMessageSend(id, text, service != "iMessage" ? "sms" : "iMessage");
    })
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
      reg.addRegexPattern("users", "@__mpb__imessage_.*", true);
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
