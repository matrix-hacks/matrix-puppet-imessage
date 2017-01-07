const Promise = require('bluebird');
const Client = require('./src/client');
const config = require('./config.json');
const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const puppet = new Puppet('./config.json');


class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "imessage";
  }
  defaultDeduplicationTag() {
    return " \ufeff"; // Zero width non-breaking space
  }
  defaultDeduplicationTagPattern() {
    return " \\ufeff$"; // Zero width non-breaking space
  }
  initThirdPartyClient() {
    this.roomNames = {};
    this.client = new Client();
    this.client.on('message', ({
      fileRecipient, isMe, message, sender, subject, service
    }) => {
      const roomId = isMe ? subject : sender;
      this.roomNames[roomId] = fileRecipient;

      // let's remember the service so we can use that to respond
      // this is either SMS or iMessage
      Promise.all([
        this.setRoomService(roomId, service),
        this.handleThirdPartyRoomMessage({
          roomId,
          senderName: fileRecipient,
          senderId: isMe ? undefined : roomId,
          text: message
        })
      ]);
    });
    return this.client.init(config.ichatArchives);
  }
  getThirdPartyRoomDataById(id) {
    return { name: this.roomNames[id], topic: 'iMessage' };
  }
  setRoomService(rid, svc) {
    return this.client.storage.setItem(rid+':service', svc);
  }
  getRoomService(rid) {
    return this.client.storage.getItem(rid+':service');
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.getRoomService(id).then(svc => {
      return this.client.sendMessage(id, text, svc);
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
