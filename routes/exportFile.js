const express = require('express');
const router = express.Router();
const pdfService = require('../services/pdf-service');
const Account = require('../models/Accounts');
const Subject = require('../models/Subjects');
const Strand = require('../models/Strands');
const SystemLog = require('../models/SystemLog');

router.get('/accounts', async (req, res) => {
  try {
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
      { label: '#', property: '__rowNumber', width: 45 },
      { label: 'User ID', property: 'userID', width: 100 },
      { label: 'Name', property: 'fullName', width: 120 }, 
      { label: 'Email', property: 'email', width: 190 },
      { label: 'Role', property: 'role', width: 80 },
      { label: 'Mobile', property: 'mobile', width: 100 },
      { label: 'Status', property: 'status', width: 70 },
    ];    

    pdfService.buildPDF(modifiedAccounts, accountColumns, 'Accounts Report', (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export accounts' });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const subjects = await Subject.find().lean();

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `subjects-report-${currentDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Define columns specific to subjects
    const subjectColumns = [
      { label: '#', property: '__rowNumber', width: 25 },
      { label: 'Subject ID', property: 'subjectID', width: 70 },
      { label: 'Code', property: 'subjectCode', width: 60 },
      { label: 'Name', property: 'subjectName', width: 100 },
      { label: 'WW', property: 'writtenWork', width: 30 },
      { label: 'PT', property: 'performanceTask', width: 30 },
      { label: 'QA', property: 'quarterlyAssessment', width: 30 },
      { label: 'Classification', property: 'classification', width: 85 },
      { label: 'Strand', property: 'strand', width: 50 },
      { label: 'Term', property: 'term', width: 40 },
      { label: 'Grade Level', property: 'gradeLevel', width: 70 },
      { label: 'Status', property: 'status', width: 50 },
    ];

    pdfService.buildPDF(subjects, subjectColumns, 'Subjects Report', (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export subjects' });
  }
});

const Section = require('../models/Sections'); 

router.get('/sections', async (req, res) => {
  try {
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
      { label: '#', property: '__rowNumber', width: 25 },
      { label: 'Section Name', property: 'sectionName', width: 100 },
      { label: 'Grade Level', property: 'gradeLevel', width: 70 },
      { label: 'Strand', property: 'strand', width: 80 },
      { label: 'Capacity', property: 'capacity', width: 60 },
      { label: 'Status', property: 'status', width: 50 },
    ];

    pdfService.buildPDF(modifiedSections, sectionColumns, 'Sections Report', (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export sections' });
  }
});

router.get('/strands', async (req, res) => {
  try {
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
      { label: '#', property: '__rowNumber', width: 25 },
      { label: 'Strand Code', property: 'strandCode', width: 80 },
      { label: 'Strand Name', property: 'strandName', width: 150 },
      { label: 'Status', property: 'status', width: 60 },
    ];

    pdfService.buildPDF(modifiedStrands, strandColumns, 'Strands Report', (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export strands' });
  }
});

router.get('/system-logs', async (req, res) => {
  try {
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
      { label: '#', property: '__rowNumber', width: 25 },
      { label: 'User ID', property: 'userID', width: 80 },
      { label: 'Account Name', property: 'accountName', width: 100 },
      { label: 'Role', property: 'role', width: 80 },
      { label: 'Action', property: 'action', width: 60 },
      { label: 'Detail', property: 'detail', width: 170 },
      { label: 'Timestamp', property: 'createdAt', width: 130 },
    ];

    pdfService.buildPDF(modifiedLogs, logColumns, 'System Logs Report', (chunk) => res.write(chunk), () => res.end());
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export system logs' });
  }
});

module.exports = router;
