const db = require('../config/firebase')

async function writeAuditLog({
    adminId,
    adminEmail,
    action,
    targetId = null,
    targetType = null,
    req,
    metadata = {}
}) {
    try {
        await db.realtime.ref('admin_audit_logs').push({
            admin_id: adminId,
            admin_email: adminEmail,
            action,
            target_id: targetId,
            target_type: targetType,
            ip_address: req?.ip || req?.connection?.remoteAddress || 'unknown',
            user_agent: req?.headers?.['user-agent'] || 'unknown',
            metadata,
            timestamp: new Date().toISOString()
        })
    } catch (err) {
        console.error('Audit log write failed:', err.message)
    }
}

module.exports = { writeAuditLog }
