const express = require('express')
const db = require('../config/firebase')
const adminAuth = require('../middleware/adminAuth')
const { enableUser, disableUser } = require('../mikrotik/api')
const { writeAuditLog } = require('../utils/auditLog')

const router = express.Router()
router.use(adminAuth)

function listFromSnapshot(snapshot) {
    const items = []
    snapshot.forEach((child) => items.push({ id: child.key, ...child.val() }))
    return items
}

router.get('/', async (req, res) => {
    const tenantsSnap = await db.realtime.ref('tenants').get()
    const users = []

    for (const tenant of listFromSnapshot(tenantsSnap)) {
        const customersSnap = await db.realtime.ref(`tenants/${tenant.id}/customers`).get()
        listFromSnapshot(customersSnap).forEach((customer) => {
            users.push({
                ...customer,
                tenant_id: tenant.id,
                tenant_name: tenant.business_name
            })
        })
    }

    res.json(users)
})

router.patch('/:tenantId/:customerId', async (req, res) => {
    const { tenantId, customerId } = req.params
    const allowed = ['name', 'phone', 'username', 'package', 'status', 'expiry_date', 'auto_reconnect']
    const updates = {}
    allowed.forEach((field) => {
        if (req.body[field] !== undefined) updates[field] = req.body[field]
    })

    await db.realtime.ref(`tenants/${tenantId}/customers/${customerId}`).update(updates)
    await writeAuditLog({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        action: 'UPDATE_USER',
        targetId: customerId,
        targetType: 'customer',
        req,
        metadata: { tenantId, updated_fields: Object.keys(updates) }
    })

    res.json({ message: 'User updated' })
})

router.post('/:tenantId/:customerId/reconnect', async (req, res) => {
    const { tenantId, customerId } = req.params
    const tenantSnap = await db.realtime.ref(`tenants/${tenantId}`).get()
    const customerSnap = await db.realtime.ref(`tenants/${tenantId}/customers/${customerId}`).get()

    if (!tenantSnap.exists() || !customerSnap.exists()) {
        return res.status(404).json({ error: 'Tenant or user not found' })
    }

    const tenant = { id: tenantSnap.key, ...tenantSnap.val() }
    const customer = { id: customerSnap.key, ...customerSnap.val() }
    await enableUser(tenant, customer.username)

    res.json({ message: 'User reconnected' })
})

router.post('/:tenantId/:customerId/disable', async (req, res) => {
    const { tenantId, customerId } = req.params
    const tenantSnap = await db.realtime.ref(`tenants/${tenantId}`).get()
    const customerSnap = await db.realtime.ref(`tenants/${tenantId}/customers/${customerId}`).get()

    if (!tenantSnap.exists() || !customerSnap.exists()) {
        return res.status(404).json({ error: 'Tenant or user not found' })
    }

    const tenant = { id: tenantSnap.key, ...tenantSnap.val() }
    const customer = { id: customerSnap.key, ...customerSnap.val() }
    await disableUser(tenant, customer.username)
    await db.realtime.ref(`tenants/${tenantId}/customers/${customerId}`).update({ status: 'inactive' })

    res.json({ message: 'User disabled' })
})

module.exports = router
