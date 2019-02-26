'use strict';

const libp2p=require("libp2p");
const PeerInfo=require("peer-info");
const WSStar=require("libp2p-websocket-star");
const Mplex=require("libp2p-mplex");

class Node extends libp2p {
  constructor(_options) {
    const wsStar = new WSStar({ id: _options.peerInfo.id });
    const defaults = {
      modules: {
        transport: [wsStar],
        streamMuxer: [Mplex],
        peerDiscovery: [wsStar.discovery]
      }
    };
    super({ ...defaults, ..._options });
  }
}

const createNode = async websocketStars => new Promise((resolve, reject) => {
  PeerInfo.create((err, peerInfo) => {
    if (err) reject(err);
    websocketStars.forEach(addr => peerInfo.multiaddrs.add(addr));
    const node = new Node({ peerInfo });
    resolve(node);
  });
});

module.exports = createNode;