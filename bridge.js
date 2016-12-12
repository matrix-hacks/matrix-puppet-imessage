let bridge;
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
const Promise = require('bluebird');

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
    bridge = new Bridge({
      homeserverUrl: config.bridge.homeserverUrl,
      domain: config.bridge.domain,
      registration: config.bridge.registration,
      controller: {
        onUserQuery: function(queriedUser) {
          console.log('got user query');
          return {} // auto provision users w no additional data
        },
        onEvent: function({data: { type, room_id, content: { body }}}, context) {
          console.log('got incoming matrix request of type', type);
          //console.log(request, context);
          //console.log('req data type', request.data.type);
          if (type === "m.room.message") {
            console.log('handing message from matrix user');
            console.log('room id', room_id);
            console.log('message', body);
            storage.getItem(room_id).then((meta) => {
              if ( meta && meta.handle ) {
                console.log('i must deliver this to', meta.handle);
                console.log('ok delivering it');
                iMessageSend(meta.handle, body);
              }
            })
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

  this.handleIncoming = (msg, markSent, fileRecipient) => {
    return new Promise(function(resolve, reject) {
      if (msg.isNotMe) {
        console.log('handling incoming message from apple', msg);
        const ghost = "@imessage_"+msg.sender+":"+config.bridge.domain;
        let intent = bridge.getIntent(ghost);
        if(fileRecipient)
        {
          intent.setDisplayName(fileRecipient + " (iMsg)");
        }

        return storage.getItem(ghost).then((meta) => {
          if (meta && meta.room_id) {
            console.log('found room', meta);
            return meta;
          } else {
            return intent.createRoom({ createAsClient: true }).then(({room_id}) => {
              let meta = { room_id };
              console.log('created room', meta);
              // we need to store room_id => imessage handle
              // in order to fulfill responses from the matrix user
              return storage.setItem(room_id, { handle: msg.sender }).then(() => {
                // and store the room ID info so we don't create dupe rooms
                return storage.setItem(ghost, meta)
              }).then(()=>meta);
            })
          }
        }).then(({room_id}) => {
          console.log('!!!!!!!!sending message', msg.message);
          // let's mark as sent early, because this is important for preventing
          // duplicate messages showing up. i want to make sure this happens...
          // XXX but it is a little shitty to do this now, before actually knowing
          // we successfully sent. but for now i would rather prevent dupes, and
          // if we host this close (LAN) to the homeserver then maybe the
          // intent.sendText will succeed very reliably anyway.
          return markSent().then(function() {
            return intent.sendText(room_id, msg.message).then(function() {
              // XXX need to check first if the owner is already in the room
              intent.invite(room_id, config.owner).then(function() {
                console.log('invited user', config.owner);
              }).catch(function(err) {
                console.log('failed to invite, user probably already in the room');
              });
            })
          })
        }).catch(function(err) {
          console.log(err);
        })
      }
    });
  }
}
