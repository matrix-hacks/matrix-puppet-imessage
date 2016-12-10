let bridge;
const Cli = require("matrix-appservice-bridge").Cli;
const Bridge = require("matrix-appservice-bridge").Bridge;
const AppServiceRegistration = require("matrix-appservice-bridge").AppServiceRegistration;
const osaimessage = require('osa-imessage');
const OWNER = '@kfatehi:synapse.keyvan.pw'
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
const iMessageSend = Promise.promisify(osaimessage.send)


new Cli({
  port: 8090,
  registrationPath: "imessage-registration.yaml",
  generateRegistration: function(reg, callback) {
    reg.setId(AppServiceRegistration.generateToken());
    reg.setHomeserverToken(AppServiceRegistration.generateToken());
    reg.setAppServiceToken(AppServiceRegistration.generateToken());
    reg.setSenderLocalpart("imessagebot");
    reg.addRegexPattern("users", "@imessage_.*", true);
    callback(reg);
  },
  run: function(port, config) {
    bridge = new Bridge({
      homeserverUrl: "https://synapse.keyvan.pw",
      domain: "synapse.keyvan.pw",
      registration: "imessage-registration.yaml",
      controller: {
        onUserQuery: function(queriedUser) {
          console.log('got user query');
          return {} // auto provision users w no additional data
        },
        onEvent: function({data: { type, room_id, content: { body }}}, context) {
          console.log('got incoming matrix request');
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
                iMessageSend(body, meta.handle);
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

  this.handleIncoming = (msg, markSent) => {
    return new Promise(function(resolve, reject) {
      if (msg.isNotMe) {
        console.log('handling incoming message from apple', msg);
        const ghost = "@imessage_"+msg.sender+":synapse.keyvan.pw";
        let intent = bridge.getIntent(ghost);
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
          return markSent().then(function() {
            return intent.sendText(room_id, msg.message).then(function() {
              // we dont want to return this promise because it might fail
              // which will cause us not to set the message to skip
              // which would then cause dupe sending
              intent.invite(room_id, OWNER).then(function() {
                console.log('invited user', OWNER);
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
