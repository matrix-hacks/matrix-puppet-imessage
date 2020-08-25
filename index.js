const Promise = require('bluebird');
const Client = require('./src/client');
const config = require('./config.json');
const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase,
  utils: { download }
} = require("matrix-puppet-bridge");
const puppet = new Puppet('./config.json');
const findAttachment = require('./src/find-attachment');
const localSeperators = new Map();

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "imessage";
  }
  getServiceName() {
    return "iMessage";
  }
  initThirdPartyClient() {
    this.roomData = {};
    this.client = new Client();
    this.client.on('message', m => this.handleThirdPartyClientMessage(m));

    localSeperators.set('en', ' at ');
    localSeperators.set('de', ' am ');

    this.receiptHistory = new Map();
    this.client.on('read', m => this.handleReadReceipt(m));

    return this.client.init(config.ichatArchives);
  }
  handleThirdPartyClientMessage(msg) {
    const {
      senderIsMe,
      sender,
      subject, //can be null, e.g. if multi-party chat
      service,
      files,
      chatId,
      isMultiParty,
      participantIds
    } = msg;
    
    let message = msg.message || ""; // yea it can come as null from ichat2json
    let fileRecipient = msg.fileRecipient;
    if(localSeperators.has(config.osLanguage)) { // remove date and time provided in sender name
      fileRecipient = fileRecipient.split(localSeperators.get(config.osLanguage))[0]; 
    }

    console.log('handling message', msg);

    let roomId;
    if (chatId && chatId.length > 0) {
      // this is a multi-party or group chat
      roomId = chatId;
    } else {
      // this is a 1 on 1 chat
      roomId = senderIsMe ? subject : sender;
    }
    this.roomData[roomId] = {
      name: fileRecipient,
      topic: isMultiParty ? 'iMessage: group chat' : 'iMessage: 1-on-1 chat',
      is_direct: isMultiParty ? false : true
    };

    // too hard to get one thru applescripting contacts, just allow null
    // so that we can use bang commands and have them persist forever.
    // by preventing base class from calling setDisplayName when senderName is null
    this.allowNullSenderName = true;

    return this.setRoomService(roomId, service).then(()=>{
      let payload = {
        roomId,
        senderName: isMultiParty ? null : fileRecipient,
        senderId: senderIsMe ? undefined : sender,
        text: message
      };
      if ( files.length > 0 ) {
        return Promise.map(files, (file)=>{
          return findAttachment(file.id, file.name).then(filepath=>{
            payload.path = filepath;
            return this.handleThirdPartyRoomMessageWithAttachment(payload);
          });
        });
      } else {
        return this.handleThirdPartyRoomMessage(payload);
      }
    }).then(() => {
      return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
    }).then((matrixRoomId) => {
      // we need to pre-emptively put all the participants into the room
      // since we have that information now, and a group-message response
      // will need all participants (even if they haven't sent a message yet).
      // to be in the room.
      console.log('making extra ghosts..', participantIds);
      const otherPeople = participantIds.filter(pid=> !pid.match(/^e:/));
      console.log('filtered out myself', otherPeople);
      return Promise.map(otherPeople, (senderId) => {
        return this.getIntentFromThirdPartySenderId(senderId).then(ghost=>{
          return ghost.join(matrixRoomId).then(()=>{
            console.log('joined ghost', senderId);
          }, (err)=>{
            console.log('failed to join ghost', senderId, err);
          });
        });
      });
    }).catch(err=>{
      console.error(err.stack);
    });
  }

  async handleReadReceipt(msg) {
    console.log("mark message as read");
    try {
      const {
        senderIsMe,
        sender,
        subject, //can be null, e.g. if multi-party chat
        chatId
      } = msg;
      let roomId;
      if (chatId && chatId.length > 0) {
        // this is a multi-party or group chat
        roomId = chatId;
      } else {
        // this is a 1 on 1 chat
        roomId = senderIsMe ? subject : sender;
      }
      if(!this.receiptHistory.has(roomId)) {
        console.log("no send event found, returning");
        return;
      }
      const event = this.receiptHistory.get(roomId);
      const ghostIntent = await this.getIntentFromThirdPartySenderId(sender);
      const matrixRoomId = await this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
      // HACK: copy from matrix-appservice-bridge/lib/components/indent.js
      // client can get timeout value, but intent does not support this yet.
      await ghostIntent._ensureJoined(matrixRoomId);
      await ghostIntent._ensureHasPowerLevelFor(matrixRoomId, "m.read");
      ghostIntent.client.sendReadReceipt (event);
      return this.receiptHistory.delete(roomId);      
    } catch (err) {
      console.log('could not send read event', err.message);
    }
  }

  getThirdPartyRoomDataById(id) {
    return this.roomData[id];
  }
  setRoomService(rid, svc) {
    return this.client.storage.setItem(rid+':service', svc);
  }
  getRoomService(rid) {
    return this.client.storage.getItem(rid+':service');
  }
  prepareToSend(id, matrixEvent) {
    if ( id.match(/^chat/) ) {
      return Promise.resolve({ isGroup: true });
    } else {
      return this.getRoomService(id).then(service => ({
        isGroup: false,
        service
      }));
    }
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text, matrixEvent) {
    const { sendGroupMessage, sendMessage } = this.client;
    matrixEvent.getRoomId = () => matrixEvent.room_id;
    matrixEvent.getId = () => matrixEvent.event_id;
    this.receiptHistory.set(id, matrixEvent);
    return this.prepareToSend(id, matrixEvent).then(({isGroup, service})=>{
      return isGroup ? sendGroupMessage(id, text) : sendMessage(id, service, text);
    });
  }

  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, { url, text }, matrixEvent) {
    const { sendGroupMessage, sendMessage } = this.client;
    return download.getTempfile(url, { tagFilename: true }).then(({path}) => {
      const img = path;
      return this.prepareToSend(id, matrixEvent).then(({isGroup, service})=>{
        return isGroup ? sendGroupMessage(id, text, img) : sendMessage(id, service, text, img);
      });
    });
  }

  sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
    //this does nothing but avoiding exceptions :)
  }

  sendTypingEventAsPuppetToThirdPartyRoomWithId() {
    //also avoid exceptions
  }

  handleMatrixUserBangCommand(bangCmd, matrixMsgEvent) {
    const { bangcommand, command, body } = bangCmd;
    const { room_id } = matrixMsgEvent;
    const client = this.puppet.getClient();
    const reply = (str) => client.sendNotice(room_id, str);
    if ( command === 'help' ) {
      reply([
        'Bang Commands',
        '!help ............................. display this information',
        '!rename <id> <new name> ..... set a ghost user display name. id is @imessage_(.+):',
      ].join('\n'));
    } else if ( command === 'rename' ) {
      const [id, ...rest] = body.split(' ');
      return this.getIntentFromThirdPartySenderId(id).then((ghost) => {
        return ghost.setDisplayName(rest.join(' ')).then(()=>{},(err)=>{
          reply(err.stack);
        });
      });
    } else {
      reply('unrecognized command: '+bangcommand);
    }
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
      reg.addRegexPattern("aliases", "#imessage_.*", true);
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
