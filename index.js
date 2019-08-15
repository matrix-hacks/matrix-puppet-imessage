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
    this.client.on('read', m => this.setMessageRead(m));
    return this.client.init(config.ichatArchives);
  }
  handleThirdPartyClientMessage(msg) {
    const {
      fileRecipient,
      senderIsMe,
      sender,
      subject, //can be null, e.g. if multi-party chat
      service,
      files,
      chatId,
      isMultiParty,
      participantIds,
      isRead
    } = msg;

    let message = msg.message || ""; // yea it can come as null from ichat2json

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
      topic: isMultiParty ? 'iMessage: group chat' : 'iMessage: 1-on-1 chat'
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

  setMessageRead(msg) {
    console.log("mark message as read");
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
      // it's a multi party chat... we need to send to participants list
      // luckily we can find out about all the ghosts (they get preloaded)
      // and pull their handles down and use that to chat with the group
      const roomMembers = this.puppet.getMatrixRoomMembers(matrixEvent.room_id);
      const handles = roomMembers.reduce((acc, gid) => {
        let tpid = this.getThirdPartyUserIdFromMatrixGhostId(gid);
        return tpid ? [...acc, tpid] : acc;
      },[]);
      return Promise.resolve({
        isGroup: true,
        handles
      });
    } else {
      return this.getRoomService(id).then(service => ({
        isGroup: false,
        service
      }));
    }
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text, matrixEvent) {
    const { sendGroupMessage, sendMessage } = this.client;
    return this.prepareToSend(id, matrixEvent).then(({isGroup, handles, service})=>{
      return isGroup ? sendGroupMessage(handles, text) : sendMessage(id, service, text);
    });
  }

  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, { url, text }, matrixEvent) {
    const { sendGroupMessage, sendMessage } = this.client;
    return download.getTempfile(url, { tagFilename: true }).then(({path}) => {
      const img = path;
      return this.prepareToSend(id, matrixEvent).then(({isGroup, handles, service})=>{
        return isGroup ? sendGroupMessage(handles, text, img) : sendMessage(id, service, text, img);
      });
    });
  }

  sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
    //this does nothing but avoiding exceptions :)
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
