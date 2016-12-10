var iMessage = require('imessage');
var im = new iMessage();
 
// Get all recipients 
//im.getRecipients(function(err, res) {
//  console.log(err);
//  res.forEach(function(e) {
//    console.log(e);
//  });
//})
//

const app = require('express')();
const bodyParser = require('body-parser')
const through = require('through');

app.use(bodyParser.json());

app.post('/events', function(req, res, next) {
  console.log('got stuff');
  console.log(req.body);
  res.send('ok');
});

app.listen(4005);
console.log('listening on 4005');
