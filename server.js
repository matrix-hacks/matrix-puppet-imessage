const app = require('express')();
const bodyParser = require('body-parser')
app.use(bodyParser.json());


const dir = "/Users/keyvan/Library/Containers/com.apple.iChat/Data/Library/Messages/Archive"

app.listen(4005);
console.log('listening on 4005');
