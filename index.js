const HOME = require('os').homedir();
const chokidar = require('chokidar');
const TR = require('./transcript-reader');
const path = require('path');
const moment = require('moment');
const archives = `${HOME}/Library/Containers/com.apple.iChat/Data/Library/Messages/Archive/**/*.ichat`;
const queue = require('queue');
const q = queue();
const Bridge = require('./bridge');
let bridge;

q.timeout = 500;
q.concurrency = 1;

var nodePersist = require('node-persist');
var storage = nodePersist.create({
  dir:'persist/messages',
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  logging: false,
  continuous: true,
  interval: false,
  ttl: '24h'
})

storage.init().then(function() {
  let ready = false;
  const watcherOptions = { persistent: true, ignoreInitial: false }
  const watcher = chokidar.watch(archives, watcherOptions);
  watcher.on('add', process);
  watcher.on('change', process);
  watcher.on('ready', () => {
    q.on('end', function() {
      bridge = new Bridge();
      bridge.init().then(function() {
        ready = true
        console.log('ready');
        //bridge.handleIncoming({
        //  isNotMe: true,
        //  sender: 'someone',
        //  message: 'hello'
        //})
      });
    });
    q.start();
  });

/** 
 * Basic algorithm for process() function:
 *
 * on start
 * for files in today's folder
 * mark each message with skip
 * 
 * on file change or add
 * go thru each message
 * if skip, do nothing
 * if not skip, do relay, mark as skip
 */
  function process(filepath) {
    var parts = filepath.split(path.sep);
    var len = parts.length;
    let [ dateString ] = parts.slice(len-2, len-1);
    var today = moment().format('YYYY-MM-DD')
    if ( ready ) {
      // go thru each msg, if skip noop, else relay+skip
      TR(filepath).getMessages().map(msg => {
        return storage.getItem(msg.hash).then((meta) => {
          let shouldSkip = meta && meta.skip;
          let shouldRelay = !shouldSkip;
          if (shouldRelay) {
            let markSkip = ({hash, sender, message}) => () => {
              //console.log('########## marking skip: ', hash, sender, message);
              return storage.setItem(hash, {skip: true});
            }
            return bridge.handleIncoming(msg, markSkip(msg))
          }
        })
      }).catch(err=>console.error(err))
    } else {
      if (dateString === today) {
        // foreach, mark skip
        q.push(function(cb) {
          TR(filepath).getMessages().map(msg => {
            //console.log('marking skip: ', path.basename(filepath), msg.sender, msg.message);
            return storage.setItem(msg.hash, {skip: true})
          }).catch(console.error).finally(cb);
        });
      }
    }
  }
});
