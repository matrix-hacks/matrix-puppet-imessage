#!/usr/bin/env node
var messages = require('osa-imessage');
 
messages.send('stuff!', '+19498875144', function(err, res) {
  if (err) throw err;
  console.log(res);
});
