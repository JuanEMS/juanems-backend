const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');

const SchoolLogoPath = path.join(__dirname, '../assets/SJDEFILogo.png');

// Admission waiver route (unchanged)
router.post('/generate-waiver-pdf', (req, res) => {
  console.log('Received POST to /generate-waiver-pdf');
  try {
    const { userData, waivedRequirements, academicYear, dateIssued, dateSigned } = req.body;

    if (!userData || !waivedRequirements || waivedRequirements.length === 0) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      info: {
        Title: 'Admission Waiver Form',
        Author: 'San Juan De Dios Educational Foundation, Inc.',
        Creator: 'JuanEMS System',
      },
    });

    const buffers = [];
    doc.on('data', (data) => buffers.push(data));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=waiver.pdf',
        'Content-Length': pdfData.length,
      });
      res.send(pdfData);
    });

    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - marginLeft - marginRight;

    const formattedDateIssued = moment.tz(dateIssued, 'Asia/Manila').format('MMMM D, YYYY');
    const formattedDateSigned = moment.tz(dateSigned, 'Asia/Manila').format('MMMM D, YYYY, h:mm A');
    const currentTime = moment().tz('Asia/Manila').format('MMMM D, YYYY, h:mm A');
    
    const headerHeight = 50;
    doc.rect(0, 0, pageWidth, headerHeight).fill('#00245A');
    doc.rect(0, headerHeight, pageWidth, 3).fill('#C68A00');
    
    const logoSize = 32;
    const logoY = (headerHeight - logoSize) / 2;
    
    if (fs.existsSync(SchoolLogoPath)) {
      doc.image(SchoolLogoPath, marginLeft, logoY, { width: logoSize, height: logoSize });
    }

    const textX = marginLeft + logoSize + 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text('SAN JUAN DE DIOS EDUCATIONAL FOUNDATION, INC.', textX, logoY + 3, {
        width: contentWidth - textX + marginLeft,
      });
    
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#dddddd')
      .text('Where faith and reason are expressed in Charity.', textX, logoY + 18, {
        width: contentWidth - textX + marginLeft,
      });

    let y = headerHeight + 20;
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#000000')
      .text('Admission Waiver Form', marginLeft, y, { align: 'center', width: contentWidth });
    y += 30;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text(`Academic Year: ${academicYear}`, marginLeft, y, { width: contentWidth });
    y += 12;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Generated on: ${currentTime}`, marginLeft, y, { width: contentWidth });
    y += 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('To Whom It May Concern,', marginLeft, y, { width: contentWidth });
    y += 15;
    
    const requestText = 'May I request from your office to allow me to continue my admission process even I lack the following credentials listed below due to reason that:';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(requestText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(requestText, { width: contentWidth }) + 8;

    const reason = waivedRequirements[0].waiverDetails.reason;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(reason, marginLeft + 12, y, { width: contentWidth - 12 });
    y += doc.heightOfString(reason, { width: contentWidth - 12 }) + 8;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('List of Waived Requirements:', marginLeft, y, { width: contentWidth });
    y += 12;
    
    waivedRequirements.forEach((req, index) => {
      const reqText = `${index + 1}. ${req.name}`;
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(reqText, marginLeft + 12, y, { width: contentWidth - 12 });
      y += doc.heightOfString(reqText, { width: contentWidth - 12 }) + 4;
    });

    y += 8;
    const promiseDate = moment.tz(waivedRequirements[0].waiverDetails.promiseDate, 'Asia/Manila').format('MMMM D, YYYY');
    const promiseText = `I promise to submit my credentials on or before ${promiseDate}.`;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(promiseText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(promiseText, { width: contentWidth }) + 8;

    const consequenceText = 'I understand that failure to submit my credentials on the said date will automatically forfeit my admission in San Juan De Dios Educational Foundation, Inc. without any refund.';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(consequenceText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(consequenceText, { width: contentWidth }) + 15;

    const maxContentY = pageHeight - marginLeft - 80;
    if (y + 80 > maxContentY) {
      doc.addPage();
      y = marginLeft;
    }
    
    const userName = `${userData.firstName} ${userData.lastName}`.toUpperCase();
    
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(userName, marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(formattedDateSigned, marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });
    y += 18;

    doc
      .moveTo(marginLeft, y)
      .lineTo(marginLeft + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    doc
      .moveTo(marginLeft + contentWidth / 1.5, y)
      .lineTo(marginLeft + contentWidth / 1.5 + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    y += 8;

    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Signature over Printed Name', marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Date and Time Signed', marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });

    y = pageHeight - marginLeft - 20;
    doc
      .moveTo(marginLeft, y - 8)
      .lineTo(pageWidth - marginRight, y - 8)
      .lineWidth(0.5)
      .strokeColor('#C68A00')
      .stroke();
    
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#444444')
      .text('Page 1 of 1', marginLeft, y, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });
    
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#990000')
      .text('San Juan De Dios Educational Foundation, Inc. © 2025', marginLeft, y + 10, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Enrollment waiver route
router.post('/generate-enrollment-waiver-pdf', (req, res) => {
  console.log('Received POST to /generate-enrollment-waiver-pdf');
  try {
    const { userData, waivedRequirements, academicYear, dateIssued, dateSigned } = req.body;

    if (!userData || !waivedRequirements || waivedRequirements.length === 0) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      info: {
        Title: 'Enrollment Waiver Form',
        Author: 'San Juan De Dios Educational Foundation, Inc.',
        Creator: 'JuanEMS System',
      },
    });

    const buffers = [];
    doc.on('data', (data) => buffers.push(data));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=enrollment_waiver.pdf',
        'Content-Length': pdfData.length,
      });
      res.send(pdfData);
    });

    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - marginLeft - marginRight;

    const formattedDateIssued = moment.tz(dateIssued, 'Asia/Manila').format('MMMM D, YYYY');
    const formattedDateSigned = moment.tz(dateSigned, 'Asia/Manila').format('MMMM D, YYYY, h:mm A');
    const currentTime = moment().tz('Asia/Manila').format('MMMM D, YYYY, h:mm A');
    
    const headerHeight = 50;
    doc.rect(0, 0, pageWidth, headerHeight).fill('#00245A');
    doc.rect(0, headerHeight, pageWidth, 3).fill('#C68A00');
    
    const logoSize = 32;
    const logoY = (headerHeight - logoSize) / 2;
    
    if (fs.existsSync(SchoolLogoPath)) {
      doc.image(SchoolLogoPath, marginLeft, logoY, { width: logoSize, height: logoSize });
    }

    const textX = marginLeft + logoSize + 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text('SAN JUAN DE DIOS EDUCATIONAL FOUNDATION, INC.', textX, logoY + 3, {
        width: contentWidth - textX + marginLeft,
      });
    
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#dddddd')
      .text('Where faith and reason are expressed in Charity.', textX, logoY + 18, {
        width: contentWidth - textX + marginLeft,
      });

    let y = headerHeight + 20;
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#000000')
      .text('Enrollment Waiver Form', marginLeft, y, { align: 'center', width: contentWidth });
    y += 30;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text(`Academic Year: ${academicYear}`, marginLeft, y, { width: contentWidth });
    y += 12;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Generated on: ${currentTime}`, marginLeft, y, { width: contentWidth });
    y += 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('To Whom It May Concern,', marginLeft, y, { width: contentWidth });
    y += 15;
    
    const requestText = 'May I request from your office to allow me to continue my enrollment process even I lack the following credentials listed below due to reason that:';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(requestText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(requestText, { width: contentWidth }) + 8;

    const reason = waivedRequirements[0].waiverDetails.reason;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(reason, marginLeft + 12, y, { width: contentWidth - 12 });
    y += doc.heightOfString(reason, { width: contentWidth - 12 }) + 8;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('List of Waived Requirements:', marginLeft, y, { width: contentWidth });
    y += 12;
    
    waivedRequirements.forEach((req, index) => {
      const reqText = `${index + 1}. ${req.name}`;
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(reqText, marginLeft + 12, y, { width: contentWidth - 12 });
      y += doc.heightOfString(reqText, { width: contentWidth - 12 }) + 4;
    });

    y += 8;
    const promiseDate = moment.tz(waivedRequirements[0].waiverDetails.promiseDate, 'Asia/Manila').format('MMMM D, YYYY');
    const promiseText = `I promise to submit my credentials on or before ${promiseDate}.`;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(promiseText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(promiseText, { width: contentWidth }) + 8;

    const consequenceText = 'I understand that failure to submit my credentials on the said date will automatically forfeit my enrollment in San Juan De Dios Educational Foundation, Inc. without any refund.';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(consequenceText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(consequenceText, { width: contentWidth }) + 15;

    const maxContentY = pageHeight - marginLeft - 80;
    if (y + 80 > maxContentY) {
      doc.addPage();
      y = marginLeft;
    }
    
    const userName = `${userData.firstName} ${userData.lastName}`.toUpperCase();
    
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(userName, marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(formattedDateSigned, marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });
    y += 18;

    doc
      .moveTo(marginLeft, y)
      .lineTo(marginLeft + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    doc
      .moveTo(marginLeft + contentWidth / 1.5, y)
      .lineTo(marginLeft + contentWidth / 1.5 + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    y += 8;

    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Signature over Printed Name', marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Date and Time Signed', marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });

    y = pageHeight - marginLeft - 20;
    doc
      .moveTo(marginLeft, y - 8)
      .lineTo(pageWidth - marginRight, y - 8)
      .lineWidth(0.5)
      .strokeColor('#C68A00')
      .stroke();
    
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#444444')
      .text('Page 1 of 1', marginLeft, y, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });
    
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#990000')
      .text('San Juan De Dios Educational Foundation, Inc. © 2025', marginLeft, y + 10, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating enrollment waiver PDF:', error);
    res.status(500).json({ error: 'Failed to generate enrollment waiver PDF' });
  }
});

// Voucher waiver route
router.post('/generate-voucher-waiver-pdf', (req, res) => {
  console.log('Received POST to /generate-voucher-waiver-pdf');
  try {
    const { userData, waivedRequirements, academicYear, dateIssued, dateSigned } = req.body;

    if (!userData || !waivedRequirements || waivedRequirements.length === 0) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      info: {
        Title: 'Voucher Waiver Form',
        Author: 'San Juan De Dios Educational Foundation, Inc.',
        Creator: 'JuanEMS System',
      },
    });

    const buffers = [];
    doc.on('data', (data) => buffers.push(data));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=voucher_waiver.pdf',
        'Content-Length': pdfData.length,
      });
      res.send(pdfData);
    });

    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - marginLeft - marginRight;

    const formattedDateIssued = moment.tz(dateIssued, 'Asia/Manila').format('MMMM D, YYYY');
    const formattedDateSigned = moment.tz(dateSigned, 'Asia/Manila').format('MMMM D, YYYY, h:mm A');
    const currentTime = moment().tz('Asia/Manila').format('MMMM D, YYYY, h:mm A');
    
    const headerHeight = 50;
    doc.rect(0, 0, pageWidth, headerHeight).fill('#00245A');
    doc.rect(0, headerHeight, pageWidth, 3).fill('#C68A00');
    
    const logoSize = 32;
    const logoY = (headerHeight - logoSize) / 2;
    
    if (fs.existsSync(SchoolLogoPath)) {
      doc.image(SchoolLogoPath, marginLeft, logoY, { width: logoSize, height: logoSize });
    }

    const textX = marginLeft + logoSize + 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text('SAN JUAN DE DIOS EDUCATIONAL FOUNDATION, INC.', textX, logoY + 3, {
        width: contentWidth - textX + marginLeft,
      });
    
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#dddddd')
      .text('Where faith and reason are expressed in Charity.', textX, logoY + 18, {
        width: contentWidth - textX + marginLeft,
      });

    let y = headerHeight + 20;
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#000000')
      .text('Voucher Waiver Form', marginLeft, y, { align: 'center', width: contentWidth });
    y += 30;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text(`Academic Year: ${academicYear}`, marginLeft, y, { width: contentWidth });
    y += 12;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Generated on: ${currentTime}`, marginLeft, y, { width: contentWidth });
    y += 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('To Whom It May Concern,', marginLeft, y, { width: contentWidth });
    y += 15;
    
    const requestText = 'May I request from your office to allow me to continue my voucher application process even I lack the following credentials listed below due to reason that:';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(requestText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(requestText, { width: contentWidth }) + 8;

    const reason = waivedRequirements[0].waiverDetails.reason;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(reason, marginLeft + 12, y, { width: contentWidth - 12 });
    y += doc.heightOfString(reason, { width: contentWidth - 12 }) + 8;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('List of Waived Requirements:', marginLeft, y, { width: contentWidth });
    y += 12;
    
    waivedRequirements.forEach((req, index) => {
      const reqText = `${index + 1}. ${req.name}`;
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(reqText, marginLeft + 12, y, { width: contentWidth - 12 });
      y += doc.heightOfString(reqText, { width: contentWidth - 12 }) + 4;
    });

    y += 8;
    const promiseDate = moment.tz(waivedRequirements[0].waiverDetails.promiseDate, 'Asia/Manila').format('MMMM D, YYYY');
    const promiseText = `I promise to submit my credentials on or before ${promiseDate}.`;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(promiseText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(promiseText, { width: contentWidth }) + 8;

    const consequenceText = 'I understand that failure to submit my credentials on the said date will automatically forfeit my voucher application in San Juan De Dios Educational Foundation, Inc. without any refund.';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(consequenceText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(consequenceText, { width: contentWidth }) + 15;

    const maxContentY = pageHeight - marginLeft - 80;
    if (y + 80 > maxContentY) {
      doc.addPage();
      y = marginLeft;
    }
    
    const userName = `${userData.firstName} ${userData.lastName}`.toUpperCase();
    
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(userName, marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(formattedDateSigned, marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });
    y += 18;

    doc
      .moveTo(marginLeft, y)
      .lineTo(marginLeft + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    doc
      .moveTo(marginLeft + contentWidth / 1.5, y)
      .lineTo(marginLeft + contentWidth / 1.5 + 180, y)
      .lineWidth(0.5)
      .strokeColor('#444444')
      .stroke();
    y += 8;

    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Signature over Printed Name', marginLeft, y, { width: contentWidth / 2, align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Date and Time Signed', marginLeft + contentWidth / 2, y, {
        width: contentWidth / 2,
        align: 'right',
      });

    y = pageHeight - marginLeft - 20;
    doc
      .moveTo(marginLeft, y - 8)
      .lineTo(pageWidth - marginRight, y - 8)
      .lineWidth(0.5)
      .strokeColor('#C68A00')
      .stroke();
    
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#444444')
      .text('Page 1 of 1', marginLeft, y, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });
    
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#990000')
      .text('San Juan De Dios Educational Foundation, Inc. © 2025', marginLeft, y + 10, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating voucher waiver PDF:', error);
    res.status(500).json({ error: 'Failed to generate voucher waiver PDF' });
  }
});

// Exam permit route (unchanged)
router.post('/generate-exam-permit', (req, res) => {
  console.log('Received POST to /generate-exam-permit:', req.body);
  try {
    const { userData, examDetails } = req.body;

    if (!userData || !examDetails) {
      console.error('Missing required data:', { userData, examDetails });
      return res.status(400).json({ error: 'Missing required data' });
    }

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      info: {
        Title: 'Admission Exam Permit',
        Author: 'San Juan De Dios Educational Foundation, Inc.',
        Creator: 'JuanEMS System',
      },
    });

    const buffers = [];
    doc.on('data', (data) => buffers.push(data));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=admission_exam_permit.pdf',
        'Content-Length': pdfData.length,
      });
      res.send(pdfData);
    });

    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - marginLeft - marginRight;

    const currentTime = moment().tz('Asia/Manila').format('MMMM D, YYYY, h:mm A');

    const headerHeight = 50;
    doc.rect(0, 0, pageWidth, headerHeight).fill('#00245A');
    doc.rect(0, headerHeight, pageWidth, 3).fill('#C68A00');

    const logoSize = 32;
    const logoY = (headerHeight - logoSize) / 2;

    if (fs.existsSync(SchoolLogoPath)) {
      doc.image(SchoolLogoPath, marginLeft, logoY, { width: logoSize, height: logoSize });
    }

    const textX = marginLeft + logoSize + 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text('SAN JUAN DE DIOS EDUCATIONAL FOUNDATION, INC.', textX, logoY + 3, {
        width: contentWidth - textX + marginLeft,
      });

    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#dddddd')
      .text('Where faith and reason are expressed in Charity.', textX, logoY + 18, {
        width: contentWidth - textX + marginLeft,
      });

    let y = headerHeight + 20;
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#000000')
      .text('Admission Exam Permit', marginLeft, y, { align: 'center', width: contentWidth });
    y += 30;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text(`Generated on: ${currentTime}`, marginLeft, y, { width: contentWidth });
    y += 20;

    const fields = [
      { label: 'Applicant Name', value: examDetails.applicantName || 'N/A' },
      { label: 'Applicant ID', value: examDetails.applicantID || 'N/A' },
      { label: 'Approved Date', value: examDetails.approvedDate || 'N/A' },
      { label: 'Time', value: examDetails.time || 'N/A' },
      { label: 'Room', value: examDetails.room || 'N/A' },
      { label: 'Exam Fee Status', value: examDetails.examFeeStatus || 'N/A' },
      { label: 'Exam Fee Amount', value: examDetails.examFeeAmount || 'N/A' },
      { label: 'Reference Number', value: examDetails.referenceNumber || 'N/A' },
    ];

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('Exam Details:', marginLeft, y, { width: contentWidth });
    y += 15;

    fields.forEach((field) => {
      const displayValue = field.label === 'Exam Fee Amount' && field.value !== 'N/A'
        ? field.value.replace('±', '₱')
        : field.value;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#444444')
        .text(`${field.label}: ${displayValue}`, marginLeft, y, { width: contentWidth });
      y += 15;
    });

    y += 10;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('Instructions:', marginLeft, y, { width: contentWidth });
    y += 15;

    const instructions = [
      'Please bring this permit to the examination venue.',
      'Arrive 30 minutes before the scheduled exam time.',
      'Bring a valid ID and necessary writing materials.',
      'No electronic devices are allowed inside the exam room.',
    ];

    instructions.forEach((instruction, index) => {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#444444')
        .text(`${index + 1}. ${instruction}`, marginLeft, y, { width: contentWidth });
      y += 15;
    });

    y = pageHeight - marginLeft - 20;
    doc
      .moveTo(marginLeft, y - 8)
      .lineTo(pageWidth - marginRight, y - 8)
      .lineWidth(0.5)
      .strokeColor('#C68A00')
      .stroke();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#444444')
      .text('Page 1 of 1', marginLeft, y, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });

    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#990000')
      .text('San Juan De Dios Educational Foundation, Inc. © 2025', marginLeft, y + 10, {
        width: pageWidth - marginLeft - marginRight,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('Error generating permit PDF:', error);
    res.status(500).json({ error: 'Failed to generate permit PDF' });
  }
});

module.exports = router;