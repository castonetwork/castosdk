'use strict'

const libp2p = require('libp2p')
const PeerInfo = require('peer-info')
const WSStar = require('libp2p-websocket-star')
const Mplex = require('libp2p-mplex')

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

const createPeerInfo = ()=> new Promise((resolve,reject)=>
  PeerInfo.create((err, result) => {
    if (err) reject(err);
    resolve(result);
  })
);
const createNode = async (websocketStars, peerId) => new Promise((resolve, reject) => {
  try {
    const peerInfo = peerId && new PeerInfo(peerId) || await createPeerInfo();
  } catch(e) {
    reject(e);
  }
  websocketStars.forEach(addr => peerInfo.multiaddrs.add(addr));
  const node = new Node({ peerInfo });
  resolve(node);
});

module.exports = createNode
