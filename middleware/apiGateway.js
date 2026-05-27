const crypto = require('crypto')
const cors = require('cors')
const helmet = require('helmet')
const hpp = require('hpp')

const DEFAULT_DEV_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://billing-saas-430b.onrender.com/'
]

function getAllowedOrigins() {
    const configured = (process.env.FRONTEND_ORIGIN || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)

    return [...new Set([...DEFAULT_DEV_ORIGINS, ...configured])]
}

function requestId(req, res, next) {
    req.id = req.headers['x-request-id'] || crypto.randomUUID()
    res.setHeader('X-Request-Id', req.id)
    next()
}

const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            connectSrc: ["'self'", ...getAllowedOrigins()],
            fontSrc: ["'self'", 'data:'],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false,
    hidePoweredBy: true,
    referrerPolicy: { policy: 'no-referrer' }
})

const corsMiddleware = cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true)

        const allowedOrigins = getAllowedOrigins()
        if (allowedOrigins.includes(origin)) return callback(null, true)

        return callback(new Error('Origin not allowed by CORS'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
})

const hppProtection = hpp()

const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor'])
const dangerousKeyPattern = /[$.[\]]/
const suspiciousValuePatterns = [
    /<\s*script\b/i,
    /javascript\s*:/i,
    /\bon\w+\s*=/i,
    /\b(union\s+select|select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from|drop\s+table|alter\s+table)\b/i,
    /'\s*or\s*'?\d+'?\s*=\s*'?\d+/i,
    /"\s*or\s*"?\d+"?\s*=\s*"?\d+/i,
    /--/,
    /\/\*/,
    /\.\.\//
]
const sensitiveValueKeys = new Set([
    'password',
    'mikrotik_pass',
    'mpesa_passkey',
    'mpesa_consumer_secret',
    'consumer_secret',
    'passkey',
    'secret'
])

function inspectObject(value, path = []) {
    if (!value || typeof value !== 'object') return null

    for (const [key, child] of Object.entries(value)) {
        if (dangerousKeys.has(key) || dangerousKeyPattern.test(key)) {
            return `Unsafe field name: ${[...path, key].join('.')}`
        }

        if (typeof child === 'string') {
            const normalizedKey = key.toLowerCase()
            const checks = sensitiveValueKeys.has(normalizedKey)
                ? suspiciousValuePatterns.slice(0, 3)
                : suspiciousValuePatterns

            if (checks.some(pattern => pattern.test(child))) {
                return `Suspicious input detected in: ${[...path, key].join('.')}`
            }
        }

        const nested = inspectObject(child, [...path, key])
        if (nested) return nested
    }

    return null
}

function sanitizeRequest(req, res, next) {
    const problem = inspectObject(req.body)
        || inspectObject(req.query)
        || inspectObject(req.params)

    if (problem) {
        return res.status(400).json({
            error: 'Request blocked by API gateway',
            detail: problem
        })
    }

    next()
}

function blockSuspiciousRequests(req, res, next) {
    const url = req.originalUrl || req.url || ''

    if (/\.\.\//.test(url) || /%2e%2e/i.test(url) || /<\s*script/i.test(url)) {
        return res.status(400).json({ error: 'Suspicious request blocked' })
    }

    next()
}

function jsonErrorHandler(err, req, res, next) {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            error: 'Invalid JSON payload',
            requestId: req.id
        })
    }

    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Request body too large',
            requestId: req.id
        })
    }

    if (err.message === 'Origin not allowed by CORS') {
        return res.status(403).json({
            error: 'Origin not allowed',
            requestId: req.id
        })
    }

    next(err)
}

module.exports = {
    blockSuspiciousRequests,
    corsMiddleware,
    hppProtection,
    jsonErrorHandler,
    requestId,
    sanitizeRequest,
    securityHeaders
}
