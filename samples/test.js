const ethUtil = require('ethereumjs-util');
const vrs = ethUtil.fromRpcSig('0x38e9f35d78623ae5184513717782aecd668905b4201b8c5f26c295b4061dc7ab15b4db3a3cf9c509ccadd3dd9230c47ba70768f3c25df445d36327ce7bcc71c41b');
console.log(ethUtil.ecrecover(new Buffer('879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0', 'hex'), vrs.v, vrs.r, vrs.s).toString('hex'));
