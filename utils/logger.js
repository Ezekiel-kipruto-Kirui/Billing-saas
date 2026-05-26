function timestamp() {
    return new Date().toISOString()
}

function redact(value) {
    if (value === undefined || value === null || value === '') return value
    return '***redacted***'
}

function logInfo(message, metadata = {}) {
    console.log(`[${timestamp()}] INFO ${message}`, metadata)
}

function logWarn(message, metadata = {}) {
    console.warn(`[${timestamp()}] WARN ${message}`, metadata)
}

function logError(message, err, metadata = {}) {
    console.error(`[${timestamp()}] ERROR ${message}`, {
        ...metadata,
        error: err?.message || String(err),
        stack: err?.stack
    })
}

function tenantRouterContext(tenant) {
    return {
        tenant_id: tenant?.id,
        business_name: tenant?.business_name,
        mikrotik_host: tenant?.mikrotik_host,
        mikrotik_port: tenant?.mikrotik_port || 8728,
        mikrotik_user: tenant?.mikrotik_user,
        mikrotik_pass: redact(tenant?.mikrotik_pass)
    }
}

module.exports = {
    logError,
    logInfo,
    logWarn,
    redact,
    tenantRouterContext
}
