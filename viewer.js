import EventEmitter from "./eventEmitter";
import multiaddr from "multiaddr";
import pull from "pull-stream";
import Pushable from "pull-pushable";
import createNode from "./createNode";
import stringify from "pull-stringify";

function bindPeerConnectionEvents(sendToPrism) {
  Object.assign(this.pc, {
    onicecandidate: event => {
      console.log("onicecandidate", event);
      if (event.candidate) {
        sendToPrism.push({
          topic: "sendTrickleCandidate",
          candidate: event.candidate
        });
      }
    },
    oniceconnectionstatechange: e => {
      if (this.pc.iceConnectionState === "disconnected") {
        this.pc.close();
      }
    },
    ontrack: event => {
      console.log("ontrack");
      this.mediaStream.addTrack(event.track);
    }
  });
};

class Viewer {
  constructor(options) {
    const defaults = {
      peerConnection: {
        sdpSemantics: 'unified-plan',
        iceServers: [{urls: "stun:stun.l.google.com:19302"}]
      },
      websocketStars: [multiaddr("/dns4/wsstar.casto.network/tcp/443/wss/p2p-websocket-star/")],
      constraint: {
        video: true,
        audio: true
      },
      serviceId: 'TESTO'
    };
    this.prisms = {};
    this.mediaStream = new MediaStream();
    /* events */
    this.onNodeInitiated = undefined;
    this.onReadyToCast = undefined;
    this.onClosed = undefined;
    this.onSendChannelsList = undefined;
    this.onWavesUpdated = undefined;

    this.init({ ...defaults, ...options }); 
  }
  async init(options) {
    await this.setup(options);
    console.log("start to discover relays");
    this.nodeSetup();
  }
  async setup(config) {
    this.config = config;
    this.event = new EventEmitter();
    this.sendStream = Pushable()
    for (const event of [
      "onNodeInitiated",
      "onReadyToCast",
      "onClosed",
      "onSendChannelsList",
      "onSendChannelRemoved",
      "onSendChannelAdded",
      "onWavesUpdated"
    ]) {
      this.event.addListener(event, e => this[event] && this[event](e));
    }
    if (!config.peerId) {
      this._node = await createNode(config.websocketStars);
    }
    this.event.emit("onNodeInitiated");
    return Promise.resolve();
  }
  async nodeSetup() {
    console.log(`start: ${this.config.serviceId}`, this._node);
    this._node.on('peer:discovery', peerInfo => {
      const prismPeerId = peerInfo.id.toB58String();
      !this.prisms[prismPeerId] && 
        this._node.dialProtocol(peerInfo, `/controller/${this.config.serviceId}`, (err,conn)=> {
          if (err) {
            return;
          }
          const sendToPrism = Pushable();
          this.prisms[prismPeerId] = {
            isDialed: true,
            pushable: sendToPrism,
          };
          pull(
            sendToPrism,
            stringify(),
            conn,
            pull.map(o => window.JSON.parse(o.toString())),
            pull.drain(event => {
              const events = {
                "sendCreatedOffer": async ({sdp, peerId})=> {
                  Object.assign(this.prisms[prismPeerId], {
                    channels: {
                      [peerId]: {
                        pc: new RTCPeerConnection(this.config.peerConnection)
                      }
                    }
                  });
                  this.pc = this.prisms[prismPeerId].channels[peerId].pc;
                  bindPeerConnectionEvents.call(this, sendToPrism);
                  await this.pc.setRemoteDescription(sdp);
                  let answer = await this.pc.createAnswer({
                    offerToReceiveAudio:true,
                    offerToReceiveVideo:true,
                  });
                  await this.pc.setLocalDescription(answer);
                  sendToPrism.push({
                    topic: "sendCreatedAnswer",
                    sdp: this.pc.localDescription,
                    peerId
                  });
                  /* emit event  */
                },
                "updateChannelInfo": ({type, peerId, info}) => {
                  this.event.emit(type === "added" && "onSendChannelAdded", {peerId, prismPeerId, info});
                },
                "sendTrickleCandidate": ({ice})=> {
                  this.pc.addIceCandidate(ice);
                },
                "updateWaves": ({waves})=> {
                  this.event.emit("onWavesUpdated", waves);
                },
                "sendChannelsList": ({channels})=> {
                  this.prisms[prismPeerId] = { ...this.prisms[prismPeerId], ...channels};
                  this.event.emit("onSendChannelsList", {channels, prismPeerId});
                }
              };
              console.log("[event]", event );
              events[event.topic] && events[event.topic](event);
            })
          );
          sendToPrism.push({
            topic: "registerWaveInfo",
            peerId: prismPeerId
          })
        })
    });
    this._node.on('peer:connect', peerInfo => {
      // console.log('peer connected:', peerInfo.id.toB58String())
    });
    this._node.on('peer:disconnect', peerInfo => {
      const peerId = peerInfo.id.toB58String();
      if (this.prisms[peerId]) {
        if (this.prisms[peerId].channels) {
          for (const channel in this.prisms[peerId].channels) {
            this.event.emit("onSendChannelRemoved", channel);
            delete this.prisms[peerId].channels[channel];
          }
        }
        delete this.prisms[peerId];
      }
    });
    this._node.start(err => {
      if (err) {
        console.log(err);
      } else {
        console.log("node started", this._node.peerInfo.multiaddrs.toArray().map(o => o.toString()).join("/"));
      }
    })
  }
  async getChannel(peerId, prismPeerId) {
    const sendToPrism = this.prisms[prismPeerId].pushable;
    console.log("get channel from", peerId, prismPeerId);
    this.mediaStream.getTracks().forEach(o=>this.mediaStream.removeTrack(o));
    sendToPrism.push({
      topic: "requestCreateOffer",
      peerId
    });
    return this.mediaStream;
  }
}

module.exports = Viewer;