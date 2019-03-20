'use strict'

const libp2p = require('libp2p')
const PeerInfo = require('peer-info')
const WSStar = require('libp2p-websocket-star')
const Mplex = require('libp2p-mplex')
const PeerId = require('peer-id');
class Node extends libp2p {
  constructor (_options) {
    const wsStar = new WSStar({ id: _options.peerInfo.id })
    const defaults = {
      modules: {
        transport: [wsStar],
        streamMuxer: [Mplex],
        peerDiscovery: [wsStar.discovery]
      }
    }
    super(Object.assign(defaults, _options));
  }
}

const createNode = (websocketStars, peerId) => new Promise(async (resolve, reject) => {
  PeerInfo.create.apply(null, (peerId && [peerId] || []).concat((err, peerInfo) => {
    if (err) reject(err);
    websocketStars.forEach(addr => peerInfo.multiaddrs.add(addr));
    console.log("export key", peerInfo.id.toJSON());
    resolve(new Node({ peerInfo }));
  }));
});

module.exports = createNode
