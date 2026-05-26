const readline = require('readline')
const bcrypt = require('bcryptjs')
const db = require('../config/firebase')

function validatePassword(password) {
    const rules = [
        { test: /.{12,}/, msg: 'At least 12 characters' },
        { test: /[A-Z]/, msg: 'At least one uppercase letter' },
        { test: /[a-z]/, msg: 'At least one lowercase letter' },
        { test: /[0-9]/, msg: 'At least one number' },
        { test: /[^A-Za-z0-9]/, msg: 'At least one special character' }
    ]

    return rules.filter((rule) => !rule.test.test(password))
}

function askHiddenPassword(prompt) {
    return new Promise((resolve) => {
        process.stdout.write(prompt)
        process.stdin.setRawMode(true)
        process.stdin.resume()

        let password = ''

        function handler(ch) {
            const char = ch.toString()

            if (char === '\r' || char === '\n') {
                process.stdin.setRawMode(false)
                process.stdin.removeListener('data', handler)
                process.stdout.write('\n')
                resolve(password)
            } else if (char === '\u0003') {
                process.exit(1)
            } else if (char === '\u007f' || char === '\b') {
                password = password.slice(0, -1)
            } else {
                password += char
                process.stdout.write('*')
            }
        }

        process.stdin.on('data', handler)
    })
}

async function createAdmin() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    const ask = (question) => new Promise((resolve) => rl.question(question, resolve))

    console.log('\n=== BILLING SAAS - CREATE ADMIN ===\n')

    const name = (await ask('Full name: ')).trim()
    const email = (await ask('Email address: ')).toLowerCase().trim()
    rl.pause()

    const password = await askHiddenPassword('Password (min 12 chars): ')
    rl.close()

    if (!name || !email || !password) {
        console.error('\nName, email, and password are required.')
        process.exit(1)
    }

    const errors = validatePassword(password)
    if (errors.length > 0) {
        console.error('\nPassword too weak. Requirements not met:')
        errors.forEach((error) => console.error(`  - ${error.msg}`))
        process.exit(1)
    }

    const existingSnap = await db.realtime
        .ref('admins')
        .orderByChild('email')
        .equalTo(email)
        .limitToFirst(1)
        .get()

    if (existingSnap.exists()) {
        console.error('\nError: An admin with this email already exists.')
        process.exit(1)
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const ref = await db.realtime.ref('admins').push({
        name,
        email,
        password: hashedPassword,
        role: 'admin',
        is_active: true,
        created_by: 'cli',
        last_login: null,
        login_count: 0,
        created_at: new Date().toISOString()
    })

    console.log('\nAdmin created successfully')
    console.log(`  ID:    ${ref.key}`)
    console.log(`  Name:  ${name}`)
    console.log(`  Email: ${email}\n`)
    process.exit(0)
}

createAdmin().catch((err) => {
    console.error('Fatal error:', err.message)
    process.exit(1)
})
