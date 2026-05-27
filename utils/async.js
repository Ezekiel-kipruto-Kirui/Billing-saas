function withTimeout(promise, timeoutMs, message) {
    let timeoutId

    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const err = new Error(message || `Operation timed out after ${timeoutMs}ms`)
            err.statusCode = 504
            reject(err)
        }, timeoutMs)
    })

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

module.exports = {
    withTimeout
}
