'use strict';

const EventEmitter = require("./eventEmitter");
const createNode = require("./createNode");
const multiAddr = require("multiaddr");
const pull = require("pull-stream");
const Pushable = require("pull-pushable");
const stringify = require("pull-stringify");

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
      websocketStars: [multiAddr("/dns4/wsstar.casto.network/tcp/443/wss/p2p-websocket-star/")],
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

    this.dialToPrism = this.dialToPrism.bind(this);
    this.getPrismIdFromStreamerPeerInfo = this.getPrismIdFromStreamerPeerInfo.bind(this);

    this.init(Object.assign(defaults, options)).then(()=>console.log("initiated"));
  }
  async init(options) {
    await this.setup(options);
    console.log("start to discover relays");
    this.nodeSetup();
  }
  async setup(config) {
    this.config = config;
    this.event = new EventEmitter();
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
    // createNode(config.websocketStars, config && config.peerId).then(o=>this._node=o);
    this._node = await createNode(config.websocketStars, config && config.peerId &&
      await new Promise((resolve, reject)=>
        PeerId.createFromJSON(config.peerId, (err, result) => resolve(result))
      )
    );
    this.event.emit("onNodeInitiated");
    return Promise.resolve();
  }
  async getPrismIdFromStreamerPeerInfo(peerInfo) {
    return new Promise((reject, resolve) => {
      this._node.dialProtocol(peerInfo, `/streamer/${this.config.serviceId}/info`, (err, conn)=> {
        if (err) {
          console.error(err);
          return;
        }
        pull(
          conn,
          pull.drain(event => {
            const events = {
              "connectedPrismPeerId": ({prismPeerId})=> {
                console.log("connectedPrismPeerId", prismPeerId);
                resolve(prismPeerId)
              }
            };
            events[events.topic] && events[events.topic](events);
          })
        );
      });
    });
  }
  async dialToPrism({peerInfo, prismPeerId}) {
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
              for (const channel in channels) {
                this.prisms[channel] = {
                  prismPeerId
                }
              }
              this.prisms[prismPeerId] = Object.assign(this.prisms[prismPeerId], channels);
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
  }
  nodeSetup() {
    console.log(`start: ${this.config.serviceId}`, this._node);
    this._node.on('peer:discovery', async peerInfo => {
      let prismPeerId = peerInfo.id.toB58String();
      if (!this.prisms[prismPeerId]) {
        await this.dialToPrism({peerInfo, prismPeerId});
      }
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
    this._node.on('start', async ()=> {
      if (this.config.streamerPeerId) {
        const directNode = await createNode(this.config.websocketStars, this.config && this.config.streamerPeerId);
        const prismPeerId = await this.getPrismIdFromStreamerPeerInfo(directNode._node.peerInfo);
        console.log(prismPeerId);
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
  async getChannel(peerId) {
    const prismPeerId = this.prisms[peerId].prismPeerId;
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