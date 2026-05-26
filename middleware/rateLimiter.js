const { rateLimit, ipKeyGenerator } = require('express-rate-limit')

const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 10) || 900000,
    max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS, 10) || 300,
    message: {
        error: 'Too many requests. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip)
})

const tenantAuthLimiter = rateLimit({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 900000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 10) || 8,
    message: {
        error: 'Too many authentication attempts. Try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    skipSuccessfulRequests: true
})

const adminLoginLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS, 10) || 5,
    message: {
        error: 'Too many login attempts. Try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    skipSuccessfulRequests: true
})

const publicPaymentLimiter = rateLimit({
    windowMs: parseInt(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS, 10) || 600000,
    max: parseInt(process.env.PAYMENT_RATE_LIMIT_MAX_ATTEMPTS, 10) || 10,
    message: {
        error: 'Too many payment attempts. Try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip)
})

module.exports = {
    adminLoginLimiter,
    apiLimiter,
    publicPaymentLimiter,
    tenantAuthLimiter
}
