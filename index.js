var iMessage = require('imessage');
var im = new iMessage();
 
// Get all recipients 
im.getRecipients(function(err, res) {
  console.log(err);
  res.forEach(function(e) {
    console.log(e);
  });
})
