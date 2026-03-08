/**
 * One-time cleanup script: removes leave requests whose employee
 * no longer exists in the User collection.
 *
 * Run with:  node scripts/cleanOrphanedLeaves.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const User = require('../models/User')
const LeaveRequest = require('../models/LeaveRequest')

async function main() {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB')

    // Fetch all unique employee IDs referenced in leaves
    const leaveEmployeeIds = await LeaveRequest.distinct('employee')
    console.log(`Found ${leaveEmployeeIds.length} unique employee IDs in leaves`)

    // Check which ones still exist in Users
    const existingUsers = await User.find(
        { _id: { $in: leaveEmployeeIds } },
        '_id'
    )
    const existingIds = new Set(existingUsers.map(u => u._id.toString()))

    // IDs that are in leaves but NOT in Users (orphaned)
    const orphanedIds = leaveEmployeeIds
        .map(id => id.toString())
        .filter(id => !existingIds.has(id))

    console.log(`Orphaned employee IDs: ${orphanedIds.length}`)

    if (orphanedIds.length > 0) {
        const result = await LeaveRequest.deleteMany({
            employee: { $in: orphanedIds }
        })
        console.log(`🗑️  Deleted ${result.deletedCount} orphaned leave request(s)`)
    } else {
        console.log('✨ No orphaned leaves found — nothing to delete')
    }

    await mongoose.disconnect()
    console.log('Done.')
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
