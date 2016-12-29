let bridge;
let matrixClient;
const config = require('./config.json')
const Cli = require("matrix-appservice-bridge").Cli;
const Bridge = require("matrix-appservice-bridge").Bridge;
const AppServiceRegistration = require("matrix-appservice-bridge").AppServiceRegistration;
const iMessageSend = require('./send-message');
const nodePersist = require('node-persist');
const storage = nodePersist.create({
  dir:'persist/rooms',
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  logging: false,
  continuous: true,
  interval: false,
  ttl: false
})
const matrixSdk = require("matrix-js-sdk");
const Promise = require('bluebird');

let lastMsgsFromMyself = [];

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    reg.setId(AppServiceRegistration.generateToken());
    reg.setHomeserverToken(AppServiceRegistration.generateToken());
    reg.setAppServiceToken(AppServiceRegistration.generateToken());
    reg.setSenderLocalpart("imessagebot");
    reg.addRegexPattern("users", "@imessage_.*", true);
    callback(reg);
  },
  run: function(port, _config) {
    //console.log(accessDat);
    bridge = new Bridge({
      homeserverUrl: config.bridge.homeserverUrl,
      domain: config.bridge.domain,
      registration: config.bridge.registration,
      controller: {
        onUserQuery: function(queriedUser) {
          console.log('got user query');
          return {} // auto provision users w no additional data
        },
        onEvent: function(req, context) {
          let r = req.getData();

          console.log('got incoming matrix request of type', r.type);
          //console.log("r");
          //console.log(r);
          //console.log("context");
          //console.log(context);

          //console.log('req data type', request.data.type);
          if (r.type === "m.room.message") {
            console.log('handing message from matrix user');
            console.log('room id', r.room_id);
            console.log('message', r.content.body);

            // Another form of duplicate message prevention, see other usage of
            // lastMsgsFromMyself further down.
            if(r.sender == config.owner)
            {
              lastMsgsFromMyself.push(r.content.body);
              while(lastMsgsFromMyself.length > 10)
              {
                lastMsgsFromMyself.shift();
              }
            }

            // Ignore m.notice messages -- Such messages were probably
            // self-sent via the imessage app by way of this very bridge! And
            // so they should not be re-propogated, otherwise duplicate
            // messages would be sent/shown in iMessages.
            //
            // This typically also has the side-benefit of showing these
            // imessage-sent messages as slightly distinct color in the matrix
            // client, so it's very clear that they originated from imessage.
            if(r.content.msgtype != 'm.notice')
            {
              storage.getItem(r.room_id).then((meta) => {
                if ( meta && meta.handle ) {
                  console.log('i must deliver this to', meta.handle);
                  console.log('ok delivering it using ' + meta.service);
                  iMessageSend(meta.handle, r.content.body, meta.service != "iMessage" ? "sms" : "iMessage");
                }
              })
            }
          }
        },
        onAliasQuery: function() {
          console.log('on alias query');
        },
        thirdPartyLookup: {
          protocols: ["imessage"],
          getProtocol: function() {
            console.log('get proto');
          },
          getLocation: function() {
            console.log('get loc');
          },
          getUser: function() {
            console.log('get user');
          }
        }
      }
    });
    console.log('Matrix-side listening on port %s', port);
    bridge.run(port, config);
  }
}).run();

module.exports = function() {
  this.init = () => storage.init();

  this.runClient = () => {
    matrixClient = matrixSdk.createClient(config.bridge.homeserverUrl);
    matrixClient.loginWithPassword(config.owner, config.ownerPassword).then( (accessDat) => {
      console.log("log in success");

      // Reinitialize client with access token.
      matrixClient = matrixSdk.createClient({
        baseUrl: config.bridge.homeserverUrl,
        userId: config.owner,
        // TODO: Instead of storing our password in the config file, prompt for
        // the username/password interactively on the terminal at startup, then
        // persist the access token on the fs. If access token login fails in a
        // subsequent startup, re-prompt for password.
        accessToken: accessDat.access_token,
      });

      matrixClient.startClient(); // This function blocks
    });
  };

  this.handleIncoming = (msg, fileRecipient) => {
    return new Promise(function(resolve, reject) {
      console.log('handling incoming message from apple', msg);
      let roomHandle = msg.isMe ? msg.subject : msg.sender;

      //const ghost = msg.isMe ? "@imessage_"+msg.subject+":"+config.bridge.domain : "@imessage_"+msg.sender+":"+config.bridge.domain;
      const ghost = "@imessage_"+roomHandle+":"+config.bridge.domain;

      // TODO: These various setDisplayName/setRoomName/etc calls should move
      // into the createRoom block below, but development is in flux at the
      // moment, so I'm running them every time for a while before moving them
      // there. This way we clean up any old/incorrect room settings from prior
      // versions.
      let intent = bridge.getIntent(ghost);

      if(fileRecipient)
      {
        intent.setDisplayName(fileRecipient);
      }

      return storage.getItem(ghost).then((meta) => {
        if (meta && meta.room_id) {
          console.log('found room', meta);

          storage.getItem(meta.room_id).then((handleMeta) => {
            if (handleMeta && handleMeta.handle) {
              if (msg.service != handleMeta.service) {
                console.log("service has changed from " + meta.service + " to " + msg.service + ". persisting...");
                handleMeta.service = msg.service;
                storage.setItem(meta.room_id, handleMeta);
              }
            }
          });

          return meta;
        } else {
          return intent.createRoom({ createAsClient: true }).then(({room_id}) => {
            let meta = {
              room_id,
              "service": msg.service
            };

            console.log('created room', meta);
            // we need to store room_id => imessage handle
            // in order to fulfill responses from the matrix user
            return storage.setItem(room_id, { handle: roomHandle, service: msg.service }).then(() => {
              // and store the room ID info so we don't create dupe rooms
              return storage.setItem(ghost, meta)
            }).then(()=>meta);
          })
        }
      }).then((meta) => {
        // Always join our puppetted matrix user to the room.
        return matrixClient.joinRoom(meta.room_id).then(() => {
          console.log("joined room " + meta.room_id);

          // TODO Ultimately this should move into the createRoom block.
          return intent.setPowerLevel(meta.room_id, config.owner, 100);
        }).then(()=> {
          // This legacy code to cleanup old secondary users and room names.
          // TODO: These can be moved/removed a bit later.
          let selfIntent = bridge.getIntent("@imessage_" + config.ownerSelfName + ":" + config.bridge.domain);
          selfIntent.leave(meta.room_id); // dont catch this promise if it fails.
        }).then(()=>{
          return intent.setRoomName(meta.room_id, ""); // NOTE: Using unamed rooms
        }).then(()=>{
          // keeps the push notification messages short. If a room name exists, it
          // adds the " in <room name>" to the end of any push notif message.
          // It's also important to keep the rooms to 2 people only to maintain
          // these short notification messages, otherwise it will start adding
          // things like " and <user 2> and <user 3>" to the notification
          // message.
          return intent.setRoomTopic(meta.room_id, "iMessage"); // can probably be moved as an option to the createRoom call.
        }).then(()=>{
          console.log('checking if msg is me');
          // This should prevent self-sent messages that originate from matrix from being re-sent to imessage.
          if(msg.isMe) {
            console.log('msg is me');
            if(lastMsgsFromMyself.indexOf(msg.message) != -1 ) { // Lol, hacks... there are so many ways this can not work.
              console.log("Bailing on mirroring of self-sent message from matrix.");
              console.log("Would result in identical message - perhaps it was already sent using a matrix client?");
              return;
            }
          }

          // If a self-sent message, use the matrix puppet to mirror it over.
          // Otherwise use the virtual (imessage_*) user that represents the
          // person we're talking to.
          var msgSender = msg.isMe ? matrixClient.sendNotice.bind(matrixClient) : intent.sendText.bind(intent);
          console.log("sending = " + msg.message + " = to " + meta.room_id);
          return msgSender(meta.room_id, msg.message);
        })
      })
    })
  }
}
