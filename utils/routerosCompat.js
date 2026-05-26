const { Channel } = require('node-routeros/dist/Channel')
const { logInfo } = require('./logger')

let patched = false

function patchRouterOsEmptyReply() {
    if (patched) return
    patched = true

    const originalProcessPacket = Channel.prototype.processPacket

    Channel.prototype.processPacket = function processPacketWithEmptySupport(packet) {
        const reply = packet?.[0]

        if (reply === '!empty') {
            logInfo('MikroTik returned empty result', { channel_id: this.Id })
            // RouterOS v7 sends !empty before the final !done for empty print
            // results. Keep the channel open so !done can resolve the promise.
            return
        }

        return originalProcessPacket.call(this, packet)
    }
}

module.exports = { patchRouterOsEmptyReply }
