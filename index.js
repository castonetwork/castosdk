import Streamer from "./streamer";
import Viewer from "./viewer";
import setimmediate from 'setimmediate';

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