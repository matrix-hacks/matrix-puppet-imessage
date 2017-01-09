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
    this.roomData = {};
    this.client = new Client();
    this.client.on('message', m => this.handleThirdPartyClientMessage(m));


    const matrixClient = this.puppet.getClient();

    this.matrixRoomMembers = {};
    matrixClient.on("RoomState.members", (event, state, _member) => {
      this.matrixRoomMembers[state.roomId] = Object.keys(state.members);
      console.log('room', state.roomId, 'members updated');
    });

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
      participantIds
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

    if ( files.length > 0 ) {
      message = `[This iMessage has ${files.length} attachments!]\n${message}`;
    }

    // too hard to get one thru applescripting contacts, just allow null
    // so that we can use bang commands and have them persist forever.
    // by preventing base class from calling setDisplayName when senderName is null
    this.allowNullSenderName = true;

    return Promise.all([
      this.setRoomService(roomId, service),
      this.handleThirdPartyRoomMessage({
        roomId,
        senderName: isMultiParty ? null : fileRecipient,
        senderId: senderIsMe ? undefined : sender,
        text: message
      })
    ]).then(() => {
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
        const ghost = this.getIntentFromThirdPartySenderId(senderId);
        return ghost.join(matrixRoomId).then(()=>{
          console.log('joined ghost', senderId);
        }, (err)=>{
          console.log('failed to join ghost', senderId, err);
        });
      });
    }).catch(err=>{
      console.error(err.stack);
    });
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
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text, matrixEvent) {
    if ( id.match(/^chat/) ) {
      // it's a multi party chat... we need to send to participants list
      // luckily we can find out about all the ghosts (they get preloaded)
      // and pull their handles down and use that to chat with the group
      
      const roomMembers = this.matrixRoomMembers[matrixEvent.room_id];
      const handles = roomMembers.reduce((acc, gid) => {
        let tpid = this.getThirdPartyUserIdFromMatrixGhostId(gid);
        return tpid ? [...acc, tpid] : acc;
      },[]);

      return this.client.sendGroupMessage(handles, text);
    } else {
      return this.getRoomService(id).then(svc => {
        return this.client.sendMessage(id, text, svc);
      });
    }
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
      const ghost = this.getIntentFromThirdPartySenderId(id);
      return ghost.setDisplayName(rest.join(' ')).then(()=>{},(err)=>{
        reply(err.stack);
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
