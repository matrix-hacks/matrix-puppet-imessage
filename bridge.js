const homeServer = 'localhost';

module.exports = {
  handleIncoming: ({
    hash,
    message,
    date,
    sender,
    isNotMe
  }) => {
    return new Promise(function(resolve, reject) {
      if (isNotMe) {
        let ghostNick = "@imessage_"+sender+':'+homeServer;
        console.log('to matrix:', ghostNick, message);
      }
    });
  }
}
