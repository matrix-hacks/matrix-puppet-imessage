const sendMessage = require('../send-message');
let test = `ha \` this m"essagE"  i'`

console.log('trying', test);

sendMessage('+17277539826', test).then(function(res) {
  console.log(res);
}).catch(function(err) {
  console.error(err);
});
