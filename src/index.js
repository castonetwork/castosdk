'use strict';

const Streamer = require("./streamer");
const Viewer = require("./viewer");

class Casto {
  constructor(options) {
    if (options && options.type ==="sender") {
      return new Streamer(options);
    } else {
      return new Viewer(options);
    }
  }
}

module.exports = Casto;