const sendMessage = require('../send-message');

sendMessage('+19498875144', "sup").then(function(res) {
  console.log(res);
}).catch(function(err) {
  console.error(err);
});
