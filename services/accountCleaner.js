const EnrolleeApplicant = require('../models/EnrolleeApplicant');
const mongoose = require('mongoose');

// Simple console logger for admin notifications (replace with real email function if needed)
async function logAdminNotification(subject, message) {
  console.log(`[ADMIN NOTIFICATION] ${subject}: ${message}`);
}

async function cleanExpiredAccounts() {
  try {
    // Clean expired verification accounts
    const result = await EnrolleeApplicant.updateMany(
      {
        status: 'Pending Verification',
        verificationExpires: { $lt: new Date() }
      },
      {
        $set: {
          status: 'Inactive',
          inactiveReason: 'Verification period expired'
        }
      }
    );

    // Modern MongoDB returns modifiedCount instead of nModified
    const count = result.modifiedCount || result.nModified || 0;
    console.log(`Cleaned ${count} expired verification accounts`);
    return count;
  } catch (error) {
    console.error('Error cleaning expired accounts:', error);
    return 0;
  }
}

async function cleanDuplicateAccounts() {
  try {
    // Find all emails with multiple accounts
    const duplicates = await EnrolleeApplicant.aggregate([
      {
        $group: {
          _id: "$email",
          count: { $sum: 1 },
          ids: { $push: "$_id" }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    let totalCleaned = 0;

    for (const dup of duplicates) {
      // Get all accounts for this email, sorted by newest first
      const accounts = await EnrolleeApplicant.find({ email: dup._id })
        .sort({ createdAt: -1 });

      // Find the newest active account if exists
      const activeAccount = accounts.find(a => a.status === 'Active');

      // Determine which accounts to keep
      const accountsToKeep = activeAccount
        ? [activeAccount]
        : accounts.filter(a => a.status === 'Pending Verification').slice(0, 1);

      // Mark all others as inactive
      const accountsToDeactivate = accounts.filter(a =>
        !accountsToKeep.some(k => k._id.equals(a._id))
      );

      if (accountsToDeactivate.length > 0) {
        const updateResult = await EnrolleeApplicant.updateMany(
          { _id: { $in: accountsToDeactivate.map(a => a._id) } },
          {
            $set: {
              status: 'Inactive',
              inactiveReason: 'Duplicate account cleanup'
            }
          }
        );

        // Modern MongoDB returns modifiedCount instead of nModified
        const count = updateResult.modifiedCount || updateResult.nModified || 0;
        totalCleaned += count;

        // Log instead of email for now
        await logAdminNotification(
          'Duplicate Account Cleanup',
          `Found and cleaned ${count} duplicate accounts for ${dup._id}`
        );
      }
    }

    console.log(`Cleaned ${totalCleaned} duplicate accounts`);
    return totalCleaned;
  } catch (error) {
    console.error('Error cleaning duplicate accounts:', error);
    return 0;
  }
}

async function cleanStaleSessions() {
  try {
    // Mark accounts as offline if they haven't been active for 24 hours
    const result = await EnrolleeApplicant.updateMany(
      {
        activityStatus: 'Online',
        lastLogin: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      {
        $set: {
          activityStatus: 'Offline',
          lastLogout: new Date()
        }
      }
    );

    // Modern MongoDB returns modifiedCount instead of nModified
    const count = result.modifiedCount || result.nModified || 0;
    console.log(`Cleaned ${count} stale sessions`);
    return count;
  } catch (error) {
    console.error('Error cleaning stale sessions:', error);
    return 0;
  }
}

// Run all cleanup tasks
async function runAllCleanupTasks() {
  try {
    console.log('Starting account cleanup tasks...');

    const expiredCount = await cleanExpiredAccounts();
    const duplicateCount = await cleanDuplicateAccounts();
    const staleCount = await cleanStaleSessions();

    console.log(`Cleanup completed: 
      - Expired accounts: ${expiredCount}
      - Duplicate accounts: ${duplicateCount} 
      - Stale sessions: ${staleCount}`);
  } catch (error) {
    console.error('Error during cleanup tasks:', error);
  }
}

// Run every 6 hours
function startAccountCleaner() {
  console.log('Starting account cleanup service...');
  runAllCleanupTasks();
  setInterval(runAllCleanupTasks, 6 * 60 * 60 * 1000);
}

module.exports = startAccountCleaner;