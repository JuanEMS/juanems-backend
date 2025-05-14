const express = require('express');
const router = express.Router();
const pdfService = require('../services/pdf-service');
const Account = require('../models/Accounts');
const Subject = require('../models/Subjects');
const Strand = require('../models/Strands');
const SystemLog = require('../models/SystemLog');
const ArchivedGuestUsers = require('../models/archivedGuestUsers');

router.get('/accounts', async (req, res) => {
  try {
    // Extract user information from query parameters
    const { userID, fullName, role } = req.query;
    const userInfo = {
      userID: userID || 'Unknown',
      fullName: fullName || 'Unknown',
      role: role || 'Unknown'
    };

    const accounts = await Account.find().lean();

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `accounts-report-${currentDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const modifiedAccounts = accounts.map((acc, index) => ({
      ...acc,
      __rowNumber: (index + 1).toString(),
      fullName: `${acc.firstName || ''} ${acc.middleName || ''} ${acc.lastName || ''}`.replace(/\s+/g, ' ').trim(),
    }));    

    const accountColumns = [
      { label: '#', property: '__rowNumber', width: 40 },
      { label: 'User ID', property: 'userID', width: 100 },
      { label: 'Name', property: 'fullName', width: 120 }, 
      { label: 'Email', property: 'email', width: 190 },
      { label: 'Role', property: 'role', width: 80 },
      { label: 'Mobile', property: 'mobile', width: 100 },
      { label: 'Status', property: 'status', width: 70 },
    ];    

    // Pass the user information to the PDF service
    pdfService.buildPDF(modifiedAccounts, accountColumns, 'Accounts Report', userInfo, (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export accounts' });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    // Extract user information from query parameters
    const { userID, fullName, role } = req.query;
    const userInfo = {
      userID: userID || 'Unknown',
      fullName: fullName || 'Unknown',
      role: role || 'Unknown'
    };

    const subjects = await Subject.find().lean();

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `subjects-report-${currentDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Add row numbers to subjects
    const modifiedSubjects = subjects.map((subject, index) => ({
      ...subject,
      __rowNumber: (index + 1).toString(),
    }));

    // Define columns specific to subjects
    const subjectColumns = [
      { label: '#', property: '__rowNumber', width: 40 },
      { label: 'Subject ID', property: 'subjectID', width: 70 },
      { label: 'Code', property: 'subjectCode', width: 60 },
      { label: 'Name', property: 'subjectName', width: 100 },
      { label: 'WW', property: 'writtenWork', width: 35 },
      { label: 'PT', property: 'performanceTask', width: 30 },
      { label: 'QA', property: 'quarterlyAssessment', width: 30 },
      { label: 'Classification', property: 'classification', width: 80 },
      { label: 'Strand', property: 'strand', width: 50 },
      { label: 'Term', property: 'term', width: 40 },
      { label: 'Grade Level', property: 'gradeLevel', width: 70 },
      { label: 'Status', property: 'status', width: 50 },
    ];

    // Pass the user information to the PDF service
    pdfService.buildPDF(modifiedSubjects, subjectColumns, 'Subjects Report', userInfo, (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export subjects' });
  }
});

const Section = require('../models/Sections');

router.get('/sections', async (req, res) => {
  try {
    // Extract user information from query parameters
    const { userID, fullName, role } = req.query;
    const userInfo = {
      userID: userID || 'Unknown',
      fullName: fullName || 'Unknown',
      role: role || 'Unknown'
    };

    const sections = await Section.find().lean();

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `sections-report-${currentDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const modifiedSections = sections.map((section, index) => ({
      ...section,
      __rowNumber: (index + 1).toString(),
    }));

    const sectionColumns = [
      { label: '#', property: '__rowNumber', width: 40 },
      { label: 'Section Name', property: 'sectionName', width: 100 },
      { label: 'Grade Level', property: 'gradeLevel', width: 70 },
      { label: 'Strand', property: 'strand', width: 80 },
      { label: 'Capacity', property: 'capacity', width: 60 },
      { label: 'Status', property: 'status', width: 50 },
    ];

    // Pass the user information to the PDF service
    pdfService.buildPDF(modifiedSections, sectionColumns, 'Sections Report', userInfo, (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export sections' });
  }
});

router.get('/strands', async (req, res) => {
  try {
    // Extract user information from query parameters
    const { userID, fullName, role } = req.query;
    const userInfo = {
      userID: userID || 'Unknown',
      fullName: fullName || 'Unknown',
      role: role || 'Unknown'
    };

    const strands = await Strand.find().lean();

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `strands-report-${currentDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const modifiedStrands = strands.map((strand, index) => ({
      ...strand,
      __rowNumber: (index + 1).toString(),
    }));

    const strandColumns = [
      { label: '#', property: '__rowNumber', width: 40 },
      { label: 'Strand Code', property: 'strandCode', width: 80 },
      { label: 'Strand Name', property: 'strandName', width: 150 },
      { label: 'Status', property: 'status', width: 60 },
    ];

    // Pass the user information to the PDF service
    pdfService.buildPDF(modifiedStrands, strandColumns, 'Strands Report', userInfo, (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export strands' });
  }
});

router.get('/system-logs', async (req, res) => {
  try {
    // Extract user information from query parameters
    const { userID, fullName, role } = req.query;
    const userInfo = {
      userID: userID || 'Unknown',
      fullName: fullName || 'Unknown',
      role: role || 'Unknown'
    };

    const logs = await SystemLog.find().lean();

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `system-logs-report-${currentDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const modifiedLogs = logs.map((log, index) => ({
      __rowNumber: (index + 1).toString(),
      userID: log.userID || 'N/A',
      accountName: log.accountName || 'N/A',
      role: log.role || 'N/A',
      action: log.action || 'N/A',
      detail: log.detail || 'N/A',
      createdAt: log.createdAt
        ? new Date(log.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
        : 'N/A',
    }));

    const logColumns = [
      { label: '#', property: '__rowNumber', width: 40 },
      { label: 'User ID', property: 'userID', width: 80 },
      { label: 'Account Name', property: 'accountName', width: 100 },
      { label: 'Role', property: 'role', width: 80 },
      { label: 'Action', property: 'action', width: 60 },
      { label: 'Detail', property: 'detail', width: 170 },
      { label: 'Timestamp', property: 'createdAt', width: 130 },
    ];

    // Pass the user information to the PDF service
    pdfService.buildPDF(modifiedLogs, logColumns, 'System Logs Report', userInfo, (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export system logs' });
  }
});

router.get('/queue-history', async (req, res) => {
  try {
    // Extract user information from query parameters
    const { userID, fullName, role } = req.query;
    const userInfo = {
      userID: userID || 'Unknown',
      fullName: fullName || 'Unknown',
      role: role || 'Unknown'
    };

    // Fetch archived queue records
    const queueHistory = await ArchivedGuestUsers.find().lean();

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `archived-queue-history-report-${currentDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Helper function to format time in minutes to readable format (similar to frontend)
    const formatTimeMinutes = (time) => {
      // Check if time is undefined, null, or not a valid number
      if (time === undefined || time === null || isNaN(parseFloat(time))) {
        return 'N/A';
      }
      
      // Convert time to a readable format
      const minutes = Math.floor(parseFloat(time));
      const seconds = Math.round((parseFloat(time) - minutes) * 60);

      if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    };

    // Add row numbers and format data for PDF
    const modifiedQueueHistory = queueHistory.map((record, index) => ({
      __rowNumber: (index + 1).toString(),
      queueNumber: record.queueNumber || 'N/A',
      department: record.department || 'N/A',
      status: record.status || 'N/A',
      exitReason: record.exitReason || 'N/A',
      // Format time values for better readability
      waitingTimeMinutes: formatTimeMinutes(record.waitingTimeMinutes),
      servingTimeMinutes: formatTimeMinutes(record.servingTimeMinutes),
      totalTimeMinutes: formatTimeMinutes(record.totalTimeMinutes),
      archivedAt: record.archivedAt
        ? new Date(record.archivedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
        : 'N/A',
    }));

    // Define columns specific to queue history
    const queueHistoryColumns = [
      { label: '#', property: '__rowNumber', width: 40 },
      { label: 'Queue #', property: 'queueNumber', width: 80 },
      { label: 'Department', property: 'department', width: 80 },
      { label: 'Status', property: 'status', width: 70 },
      { label: 'Exit Reason', property: 'exitReason', width: 90 },
      { label: 'Waiting Time', property: 'waitingTimeMinutes', width: 70 },
      { label: 'Serving Time', property: 'servingTimeMinutes', width: 60 },
      { label: 'Total Time', property: 'totalTimeMinutes', width: 70 },
      { label: 'Archived At', property: 'archivedAt', width: 130 },
    ];

    // Pass the user information to the PDF service
    pdfService.buildPDF(modifiedQueueHistory, queueHistoryColumns, 'Queue History Report', userInfo, (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export queue history' });
  }
});

module.exports = router;
