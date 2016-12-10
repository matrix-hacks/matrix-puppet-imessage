const homeServer = 'localhost';

var http = require("http");
var qs = require("querystring"); // we will use this later
var requestLib = require("request"); // we will use this later
var bridge; // we will use this later

var Cli = require("matrix-appservice-bridge").Cli;
var Bridge = require("matrix-appservice-bridge").Bridge;
var AppServiceRegistration = require("matrix-appservice-bridge").AppServiceRegistration;

new Cli({
  registrationPath: "imessage-registration.yaml",
  generateRegistration: function(reg, callback) {
    reg.setId(AppServiceRegistration.generateToken());
    reg.setHomeserverToken(AppServiceRegistration.generateToken());
    reg.setAppServiceToken(AppServiceRegistration.generateToken());
    reg.setSenderLocalpart("imessagebot");
    reg.addRegexPattern("users", "@imessage_.*", true);
    callback(reg);
  },
  run: function(port, config) {
    // we will do this later
  }
}).run();


module.exports = function() {

  this.listen = (port) => {
    http.createServer(function(request, response) {
      console.log(request.method + " " + request.url);

      var body = "";
      request.on("data", function(chunk) {
        body += chunk;
      });

      request.on("end", function() {
        console.log(body);
        response.writeHead(200, {"Content-Type": "application/json"});
        response.write(JSON.stringify({}));
        response.end();
      });
    }).listen(port);  // replace me with your actual port number!
    console.log('bridge listening on port', port);
  }

  this.handleIncoming = ({
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
