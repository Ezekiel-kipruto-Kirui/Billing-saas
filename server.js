const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
require('dotenv').config()
const { logError } = require('./utils/logger')
require('./cron/expiary')
require('./cron/connectionWatchdog')

const authRoutes = require('./routes/auth')
const customerRoutes = require('./routes/customers')
const packageRoutes = require('./routes/packages')
const paymentRoutes = require('./routes/payments')
const mpesaRoutes = require('./routes/mpesa')
const publicPortalRoutes = require('./routes/publicPortal')
const publicSiteRoutes = require('./routes/publicSite')
const adminAuthRoutes = require('./routes/adminAuth')
const adminTenantsRoutes = require('./routes/adminTenants')
const adminSiteRoutes = require('./routes/adminSite')
const adminUsersRoutes = require('./routes/adminUsers')
const auth = require('./middleware/auth')
const {
    blockSuspiciousRequests,
    corsMiddleware,
    hppProtection,
    jsonErrorHandler,
    requestId,
    sanitizeRequest,
    securityHeaders
} = require('./middleware/apiGateway')
const {
    apiLimiter,
    publicPaymentLimiter,
    tenantAuthLimiter
} = require('./middleware/rateLimiter')

const app = express()

process.on('unhandledRejection', (err) => {
    logError('Unhandled promise rejection', err)
})

process.on('uncaughtException', (err) => {
    logError('Uncaught exception', err)
})

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(requestId)
app.use(securityHeaders)
app.use('/api', corsMiddleware)
app.use('/api', bodyParser.json({ limit: process.env.JSON_BODY_LIMIT || '100kb' }))
app.use('/api', jsonErrorHandler)
app.use('/api', hppProtection)
app.use('/api', apiLimiter)
app.use(['/api/auth/login', '/api/auth/register'], tenantAuthLimiter)
app.use(['/api/public/:tenantId/pay', '/api/public/:tenantId/redeem'], publicPaymentLimiter)
app.use('/api', sanitizeRequest)
app.use('/api', blockSuspiciousRequests)

// public routes
app.use('/api/auth', authRoutes)
app.use('/api/mpesa', mpesaRoutes)
app.use('/api/public', publicSiteRoutes)
app.use('/api/public', publicPortalRoutes)
app.use('/api/admin/auth', adminAuthRoutes)

// protected routes
app.use('/api/customers', auth, customerRoutes)
app.use('/api/packages', auth, packageRoutes)
app.use('/api/payments', auth, paymentRoutes)
app.use('/api/admin/tenants', adminTenantsRoutes)
app.use('/api/admin/site', adminSiteRoutes)
app.use('/api/admin/users', adminUsersRoutes)

const frontendDist = path.join(__dirname, 'frontend', 'dist')
app.use(express.static(frontendDist))

app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
})

const port = process.env.PORT
app.listen(port, () => {
    console.log(`Billing SaaS running on port ${port}`)
})
