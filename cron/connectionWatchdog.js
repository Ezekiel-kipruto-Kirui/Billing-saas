const cron = require('node-cron')
const db = require('../config/firebase')
const { enableCustomerAccess } = require('../mikrotik/api')

cron.schedule('*/5 * * * *', async () => {
    try {
        const tenantsSnap = await db.realtime.ref('tenants').get()
        const tenants = []
        tenantsSnap.forEach((child) => tenants.push({ id: child.key, ...child.val() }))

        for (const tenant of tenants) {
            const customersSnap = await db.realtime.ref(`tenants/${tenant.id}/customers`).get()
            const now = new Date()

            const activeCustomers = []
            customersSnap.forEach((child) => {
                const customer = { id: child.key, ...child.val() }
                const expiry = customer.expiry_date ? new Date(customer.expiry_date) : null

                if (
                    customer.status === 'active' &&
                    customer.auto_reconnect &&
                    customer.username &&
                    expiry &&
                    expiry > now
                ) {
                    activeCustomers.push(customer)
                }
            })

            for (const customer of activeCustomers) {
                try {
                    await enableCustomerAccess(tenant, customer)
                    await db.realtime
                        .ref(`tenants/${tenant.id}/customers/${customer.id}`)
                        .update({ last_reconnect_check: new Date().toISOString() })
                } catch (err) {
                    console.error(`[${tenant.business_name}] Reconnect failed for ${customer.username}:`, err.message)
                }
            }
        }
    } catch (err) {
        console.error('Connection watchdog failed:', err.message)
    }
})
