require('chokidar').watch(
  `${require('os').homedir()}/Library/Containers/com.apple.iChat/Data/Library/Messages/Archive/**/*.ichat`,
  { persistent: true, ignoreInitial: true }
)
.on('add', process)
.on('change', process)

function process(path) {
  console.log('processing '+path);
}
