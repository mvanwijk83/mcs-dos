// Every test can be invoked from any working directory.
const toolchain = require('../scripts/toolchain');
toolchain.setup();
module.exports = toolchain;
