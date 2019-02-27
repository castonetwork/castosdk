# CASTO SDK
The javascript implementation of the CASTO platform.

# Usage

# Install
```
npm install --save @casto/sdk
```

# Usage
## for sender
```javascript
const Casto = require('@casto/sdk')
streamer = new Casto({type: "sender"})
```
## for viewer
```javascript
const Casto = require('@casto/sdk')
viewer = new Casto({type: "viewer"})
viewer.onSendChannelsList = ({channels, prismPeerId}) => {
  for (const channel in channels) {
    /* Do some stuff for channel list */
    button.addEventListener('click', ()=> {
      /* media should be a mediaElement for streaming */
      media.srcObject = await casto.getChannel(channel.peerId, channel.prismPeerId})
    })
  }
}
```

# API
## Methods
### Create a Casto - new Casto(options)
> create an instance of the Casto
Require keys in the `options` object:
* `type`: type of casto instance. If you want to do a broadcast, set `sender` or set `viewer` if you want to watch a broadcast.

### casto.start(): MediaStream<Promise>
> start a broadcast by the Casto.
Should return a `MediaStream`, which is an object for transfer to the remote.

### casto.getChannel(peerId, prismPeerId): <Promise>
> ...

## Events
### Sender
#### casto.onNodeInitiated:
> ...

#### casto.onReadyToCast:
> ...

#### casto.onCompleted:
> ...

#### casto.onClosed:

### Viewer
#### casto.onNodeInitiated: <function>
> ... 

#### casto.onReadyToCast: <function>
> ...

#### casto.onClosed: <function>
> ...

#### casto.onSendChannelsList: <function>
> ...

#### casto.onSendChannelRemoved: <function>
> ...

#### casto.onSendChannelAdded: <function>
> ...

#### casto.onWavesUpdated: <function>
> ...

## License

[MIT](LICENSE) © Casto Network