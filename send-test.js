#!/usr/bin/env node
var messages = require('osa-imessage');
 
messages.send('different msg 22a!', '+15555555555', function(err, res) {
  if (err) throw err;
  console.log(res);
});
