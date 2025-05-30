
const emitError = (socket, message) => {
    socket.emit('error', {
        'action': 'error',
        'message': message
    })
}

module.exports = emitError;