const express = require('express')
const bcrypt = require('bcryptjs')
const db = require('../config/firebase')
const adminAuth = require('../middleware/adminAuth')
const { writeAuditLog } = require('../utils/auditLog')
const { getCallbackUrl } = require('../mpesa/daraja')

const router = express.Router()

router.use(adminAuth)

const MASKED_FIELDS = [
    'password',
    'mikrotik_pass',
    'mpesa_consumer_secret',
    'mpesa_passkey'
]

function maskTenant(tenantData = {}) {
    const masked = { ...tenantData }
    MASKED_FIELDS.forEach((field) => {
        if (masked[field]) {
            masked[field] = '••••••••'
        }
    })
    return masked
}

function listFromSnapshot(snapshot) {
    const items = []
    snapshot.forEach((child) => {
        items.push({ id: child.key, ...child.val() })
    })
    return items
}

async function countChildren(path) {
    const snap = await db.realtime.ref(path).get()
    return snap.exists() ? snap.numChildren() : 0
}

async function findTenantByEmail(email) {
    return db.realtime
        .ref('tenants')
        .orderByChild('email')
        .equalTo(email.toLowerCase().trim())
        .limitToFirst(1)
        .get()
}

router.get('/audit/logs', async (req, res) => {
    const snap = await db.realtime
        .ref('admin_audit_logs')
        .orderByChild('timestamp')
        .limitToLast(100)
        .get()
    const logs = listFromSnapshot(snap).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'VIEW_AUDIT_LOGS',
        targetType: 'admin',
        req,
        metadata: { count: logs.length }
    })

    res.json(logs)
})

router.get('/stats/summary', async (req, res) => {
    const tenantsSnap = await db.realtime.ref('tenants').get()
    const tenants = listFromSnapshot(tenantsSnap)
    let totalCustomers = 0
    let paymentsToday = 0
    const today = new Date().toISOString().slice(0, 10)

    await Promise.all(tenants.map(async (tenant) => {
        totalCustomers += await countChildren(`tenants/${tenant.id}/customers`)
        const paymentsSnap = await db.realtime.ref(`tenants/${tenant.id}/payments`).get()
        paymentsSnap.forEach((payment) => {
            const paidAt = payment.val()?.paid_at
            if (paidAt && String(paidAt).slice(0, 10) === today) {
                paymentsToday += Number(payment.val()?.amount || 0)
            }
        })
    }))

    res.json({
        totalTenants: tenants.length,
        activeTenants: tenants.filter((tenant) => tenant.status !== 'suspended').length,
        suspendedTenants: tenants.filter((tenant) => tenant.status === 'suspended').length,
        totalCustomers,
        paymentsToday,
        systemHealth: 'healthy'
    })
})

router.get('/', async (req, res) => {
    const snap = await db.realtime.ref('tenants').get()
    const tenants = listFromSnapshot(snap).map((tenant) => ({
        id: tenant.id,
        ...maskTenant(tenant)
    }))

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'LIST_TENANTS',
        targetType: 'tenant',
        req,
        metadata: { count: tenants.length }
    })

    res.json(tenants)
})

router.post('/', async (req, res) => {
    const {
        business_name,
        owner_name,
        email,
        phone,
        password,
        mikrotik_host,
        mikrotik_user,
        mikrotik_pass,
        mikrotik_port,
        mpesa_consumer_key,
        mpesa_consumer_secret,
        mpesa_shortcode,
        mpesa_business_shortcode,
        mpesa_shortcode_type,
        mpesa_passkey
    } = req.body

    const required = [
        'business_name',
        'owner_name',
        'email',
        'phone',
        'password',
        'mikrotik_host',
        'mikrotik_user',
        'mikrotik_pass',
        'mpesa_consumer_key',
        'mpesa_consumer_secret',
        'mpesa_shortcode',
        'mpesa_business_shortcode',
        'mpesa_shortcode_type',
        'mpesa_passkey'
    ]
    const missing = required.filter((field) => !req.body[field])

    if (missing.length) {
        return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` })
    }

    const exists = await findTenantByEmail(email)
    if (exists.exists()) {
        return res.status(409).json({ error: 'Email already registered' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const ref = await db.realtime.ref('tenants').push({
        business_name,
        owner_name,
        email: email.toLowerCase().trim(),
        phone,
        password: hashedPassword,
        mikrotik_host,
        mikrotik_user,
        mikrotik_pass,
        mikrotik_port: Number(mikrotik_port || 8728),
        mpesa_consumer_key,
        mpesa_consumer_secret,
        mpesa_shortcode,
        mpesa_business_shortcode,
        mpesa_shortcode_type,
        mpesa_passkey,
        mpesa_callback_base_url: process.env.MPESA_CALLBACK_BASE_URL,
        mpesa_environment: process.env.MPESA_ENVIRONMENT || 'production',
        status: 'active',
        created_by: `admin:${req.admin.adminId}`,
        created_at: new Date().toISOString()
    })
    await ref.update({
        mpesa_callback_url: getCallbackUrl({
            id: ref.key,
            mpesa_callback_base_url: process.env.MPESA_CALLBACK_BASE_URL
        })
    })

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'CREATE_TENANT',
        targetId: ref.key,
        targetType: 'tenant',
        req,
        metadata: { business_name, email: email.toLowerCase().trim() }
    })

    res.status(201).json({ message: 'Tenant created', tenantId: ref.key })
})

router.get('/:id', async (req, res) => {
    const snap = await db.realtime.ref(`tenants/${req.params.id}`).get()

    if (!snap.exists()) {
        return res.status(404).json({ error: 'Tenant not found' })
    }

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'VIEW_TENANT',
        targetId: req.params.id,
        targetType: 'tenant',
        req
    })

    res.json({ id: snap.key, ...maskTenant(snap.val()) })
})

router.patch('/:id', async (req, res) => {
    const { id } = req.params
    const forbidden = ['password']
    const attempted = forbidden.filter((field) => req.body[field] !== undefined)

    if (attempted.length) {
        return res.status(400).json({
            error: `Cannot update sensitive fields via this route: ${attempted.join(', ')}`
        })
    }

    const allowed = [
        'business_name',
        'owner_name',
        'email',
        'phone',
        'mikrotik_host',
        'mikrotik_user',
        'mikrotik_pass',
        'mikrotik_port',
        'mpesa_shortcode',
        'mpesa_business_shortcode',
        'mpesa_shortcode_type',
        'mpesa_consumer_key',
        'mpesa_consumer_secret',
        'mpesa_passkey',
        'status'
    ]
    const updates = {}
    allowed.forEach((field) => {
        if (req.body[field] !== undefined) {
            const value = req.body[field]

            if (
                ['mikrotik_pass', 'mpesa_consumer_secret', 'mpesa_passkey'].includes(field) &&
                (!String(value).trim() || value === '••••••••')
            ) {
                return
            }

            updates[field] = field === 'email'
                ? String(value).toLowerCase().trim()
                : value
        }
    })

    if (updates.mikrotik_port !== undefined) {
        updates.mikrotik_port = Number(updates.mikrotik_port || 8728)
    }

    if (
        updates.mpesa_shortcode ||
        updates.mpesa_business_shortcode ||
        updates.mpesa_shortcode_type ||
        updates.mpesa_consumer_key ||
        updates.mpesa_consumer_secret ||
        updates.mpesa_passkey
    ) {
        updates.mpesa_callback_base_url = process.env.MPESA_CALLBACK_BASE_URL || ''
        updates.mpesa_environment = process.env.MPESA_ENVIRONMENT || 'production'
        updates.mpesa_callback_url = getCallbackUrl({
            id,
            mpesa_callback_base_url: process.env.MPESA_CALLBACK_BASE_URL
        })
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No allowed fields provided' })
    }

    await db.realtime.ref(`tenants/${id}`).update(updates)

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'UPDATE_TENANT',
        targetId: id,
        targetType: 'tenant',
        req,
        metadata: { updated_fields: Object.keys(updates) }
    })

    res.json({ message: 'Tenant updated' })
})

router.delete('/:id', async (req, res) => {
    const { id } = req.params
    await db.realtime.ref(`tenants/${id}`).update({
        status: 'suspended',
        suspended_by: req.admin.adminId,
        suspended_at: new Date().toISOString()
    })

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'SUSPEND_TENANT',
        targetId: id,
        targetType: 'tenant',
        req
    })

    res.json({ message: 'Tenant suspended' })
})

router.get('/:id/customers', async (req, res) => {
    const snap = await db.realtime.ref(`tenants/${req.params.id}/customers`).get()
    const customers = listFromSnapshot(snap)

    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'VIEW_TENANT_CUSTOMERS',
        targetId: req.params.id,
        targetType: 'tenant',
        req,
        metadata: { count: customers.length }
    })

    res.json(customers)
})

router.get('/:id/payments', async (req, res) => {
    const snap = await db.realtime.ref(`tenants/${req.params.id}/payments`).get()
    res.json(listFromSnapshot(snap))
})

router.get('/:id/packages', async (req, res) => {
    const snap = await db.realtime.ref(`tenants/${req.params.id}/packages`).get()
    res.json(listFromSnapshot(snap))
})

module.exports = router
