const cron = require('node-cron')
const db = require('../config/firebase')
const { disableCustomerAccess } = require('../mikrotik/api')

cron.schedule('0 0 * * *', async () => {
    try {
        console.log('Running expiry check across all tenants...')

        const now = new Date()

        const tenantsSnap = await db.realtime.ref('tenants').get()

        const tenants = []
        tenantsSnap.forEach((child) => tenants.push({ id: child.key, ...child.val() }))

        for (const tenant of tenants) {
            const customersSnap = await db.realtime.ref(`tenants/${tenant.id}/customers`).get()
            const expiredCustomers = []

            customersSnap.forEach((child) => {
                const customer = { id: child.key, ...child.val() }
                const expiry = customer.expiry_date ? new Date(customer.expiry_date) : null
                if (customer.status === 'active' && expiry && expiry < now) {
                    expiredCustomers.push(customer)
                }
            })

            for (const customer of expiredCustomers) {

                // disable on their MikroTik
                await disableCustomerAccess(tenant, customer)

                await db.realtime
                    .ref(`tenants/${tenant.id}/customers/${customer.id}`)
                    .update({ status: 'expired' })

                console.log(`[${tenant.business_name}] Expired: ${customer.username}`)
            }
        }
    } catch (err) {
        console.error('Expiry check failed:', err.message)
    }
})
