import libp2p from "libp2p";
import PeerInfo from "peer-info";
import WSStar from "libp2p-websocket-star";
import Mplex from "libp2p-mplex";

export default class Node extends libp2p {
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