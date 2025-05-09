const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const SchoolLogoPath = path.join(__dirname, '../assets/SJDEFILogo.png');

// Define university color scheme
const COLORS = {
  primary: '#00245A',     // Changed to match CSS (.homepage-header background-color)
  secondary: '#990000',   // Burgundy red for highlights
  gold: '#C68A00',        // Updated to match CSS (.header-right .icon, border-bottom)
  lightGray: '#f5f5f5',   // Light background for alternating rows
  mediumGray: '#e0e0e0',  // Medium gray for borders
  darkGray: '#444444',    // Dark gray for text
  white: '#ffffff'        // White for contrast text
};

function buildPDF(dataArray, columns, title, userInfo, dataCallback, endCallback) {
  const doc = new PDFDocument({ 
    margin: 50, 
    size: 'A4', 
    bufferPages: true,
    info: {
      Title: title,
      Author: 'San Juan De Dios Educational Foundation, Inc.',
      Creator: 'JuanEMS System'
    }
  });

  // Store userInfo and generation date for use in headers and footers
  const generationDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Set up event handlers
  doc.on('data', dataCallback);
  doc.on('end', () => {
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      // Add page numbers and user info header to each page
      addPageHeader(doc, i + 1, totalPages, userInfo);
      // Add the footer to each page
      addFooter(doc, i + 1, totalPages);
    }
    endCallback();
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const maxY = doc.page.height - 80; // Give more space for footer
  const tableTop = 150; // Increased space to accommodate the user info

  // Fit columns
  let totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  if (totalWidth > pageWidth) {
    const scale = pageWidth / totalWidth;
    columns.forEach(col => col.width *= scale);
  }

  const colX = columns.reduce((acc, col, i) => {
    acc[i] = i === 0 ? doc.page.margins.left : acc[i - 1] + columns[i - 1].width;
    return acc;
  }, []);

  // Draw the elegant header on first page
  drawHeaderLeftStyle(doc, title, userInfo, generationDate);
  
  // Draw the table
  const tableEndY = drawTable(doc, dataArray, columns, colX, tableTop, maxY, title, userInfo, generationDate);
  
  // Add disclaimer below the table
  addDisclaimerBelowTable(doc, tableEndY);

  doc.end();
}

// Function to add disclaimer below the table
function addDisclaimerBelowTable(doc, yPosition) {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  // Add some space after the table
  yPosition += 20;
  
  // Check if we need a new page for the disclaimer
  if (yPosition > doc.page.height - 100) {
    doc.addPage();
    yPosition = 50; // Position at the top of the new page
  }
  
  // Gold separator line
  doc.moveTo(marginLeft, yPosition)
     .lineTo(pageWidth - marginRight, yPosition)
     .lineWidth(0.5)
     .strokeColor(COLORS.gold)
     .stroke();
  
  // Disclaimer text
  doc.fontSize(8)
     .fillColor(COLORS.darkGray)
     .text('CONFIDENTIAL INFORMATION', marginLeft, yPosition + 10, {
       width: contentWidth,
       align: 'center',
       continued: false
     });
     
  doc.fontSize(7)
     .fillColor(COLORS.darkGray)
     .text(
       'DISCLAIMER: This document is confidential and intended solely for the use of San Juan De Dios Educational Foundation, Inc. Any unauthorized review, use, disclosure, or distribution is prohibited.',
       marginLeft,
       yPosition + 25,
       { width: contentWidth, align: 'left' }
     );
}

// Updated footer without page numbers
function addFooter(doc, pageNum, totalPages) {
  const footerY = doc.page.height - 40;
  const pageWidth = doc.page.width;
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  
  // Gold separator line
  doc.moveTo(marginLeft, footerY - 10)
     .lineTo(pageWidth - marginRight, footerY - 10)
     .lineWidth(0.5)
     .strokeColor(COLORS.gold)
     .stroke();
  
  // Copyright (left-aligned)
  doc.fontSize(6.5)
     .fillColor(COLORS.secondary)
     .text('San Juan De Dios Educational Foundation, Inc. © 2025', marginLeft, footerY + 15);
}

// Updated header function to include user information
function drawHeaderLeftStyle(doc, title, userInfo, generationDate) {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Blue header bar with gold border at bottom
  const headerHeight = 70; // Adjusted for the new header style
  
  // Blue background for header
  doc.rect(0, 0, pageWidth, headerHeight)
     .fill(COLORS.primary);
  
  // Gold accent line below the header (4px in CSS)
  doc.rect(0, headerHeight, pageWidth, 4)
     .fill(COLORS.gold);
  
  // Logo placement (left-aligned)
  const logoSize = 40; // Match .logohome width and height
  const logoY = (headerHeight - logoSize) / 2;
  
  if (fs.existsSync(SchoolLogoPath)) {
    doc.image(SchoolLogoPath, marginLeft, logoY, { 
      width: logoSize,
      height: logoSize
    });
  }
  
  // Header text next to the logo
  const textX = marginLeft + logoSize + 10; // Add some spacing between logo and text
  
  // Institution name - larger, bold
  doc.font('Helvetica-Bold')
     .fontSize(16) // Larger than CSS to look proportional in PDF
     .fillColor(COLORS.white)
     .text('SAN JUAN DE DIOS EDUCATIONAL FOUNDATION, INC.', 
           textX, 
           logoY + 5, // Adjust vertical alignment
           { width: contentWidth - textX + marginLeft });
  
  // Motto - smaller, italicized
  doc.font('Helvetica-Oblique')
     .fontSize(10) // Slightly larger than CSS for better readability in PDF
     .fillColor('#dddddd') // Match the CSS color
     .text('Where faith and reason are expressed in Charity.', 
           textX, 
           logoY + 25, // Position below the institution name
           { width: contentWidth - textX + marginLeft });
  
  // Title of the report (below the header)
  doc.font('Helvetica-Bold')
     .fontSize(17)
     .fillColor(COLORS.darkGray)
    .text(title.toUpperCase(), marginLeft, headerHeight + 15, {
      align: 'left',
      width: contentWidth
    });

  // Divider line between title and date
  doc.moveTo(marginLeft, headerHeight + 40)
    .lineTo(pageWidth - marginRight, headerHeight + 40)
    .lineWidth(0.5)
    .strokeColor(COLORS.mediumGray)
    .stroke();

  // Date text on right side
  doc.font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.darkGray)
     .text(`Generated on: ${generationDate}`, marginLeft, headerHeight + 45, {
       align: 'right',
       width: contentWidth
     });
  
  // Add user information below date
  if (userInfo && userInfo.userID && userInfo.fullName && userInfo.role) {
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor(COLORS.darkGray)
      .text(`Generated by: ${userInfo.fullName} (${userInfo.userID} - ${userInfo.role})`, 
        marginLeft, 
        headerHeight + 60, {
          align: 'right',
          width: contentWidth
        });
  }
}

// Function to add page number and user info at the top of EVERY page
function addPageHeader(doc, pageNum, totalPages, userInfo) {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const headerY = 10; // Position at the top of the page
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  // Page number (right-aligned)
  doc.font('Helvetica-Bold')
     .fontSize(9)
     .fillColor(COLORS.primary)
     .text(`Page ${pageNum} of ${totalPages}`, marginLeft, headerY, {
       width: contentWidth,
       align: 'right'
     });
  
  // User info (left-aligned) - only if we have user info
  if (userInfo && userInfo.fullName) {
    doc.font('Helvetica')
       .fontSize(8)
       .fillColor(COLORS.darkGray)
       .text(`Generated by: ${userInfo.fullName} (${userInfo.role || ''})${userInfo.userID ? ' - ' + userInfo.userID : ''}`, 
         marginLeft, headerY, {
           width: contentWidth,
           align: 'left'
         });
  }
}

// Updated continuation header to match the main header style but more compact
function drawContinuationHeader(doc, title, userInfo, generationDate) {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  // Smaller blue header bar
  doc.rect(0, 0, pageWidth, 40)
     .fill(COLORS.primary);
  
  // Small gold accent line (4px to match main header)
  doc.rect(0, 40, pageWidth, 4)
     .fill(COLORS.gold);
  
  // Logo on continuation pages (smaller)
  const logoSize = 30;
  if (fs.existsSync(SchoolLogoPath)) {
    doc.image(SchoolLogoPath, marginLeft, 5, { 
      width: logoSize,
      height: logoSize
    });
  }
  
  // Title in smaller font
  doc.font('Helvetica-Bold')
     .fontSize(14)
     .fillColor(COLORS.white)
     .text(title.toUpperCase(), marginLeft + logoSize + 10, 5, { 
       width: contentWidth - logoSize - 10
     });
  
  // School name (smaller)
  doc.fontSize(9)
     .text('SAN JUAN DE DIOS EDUCATIONAL FOUNDATION, INC.', marginLeft + logoSize + 10, 25, { 
       width: contentWidth - logoSize - 10
     });
}

function drawTable(doc, dataArray, columns, colX, tableTop, maxY, title, userInfo, generationDate) {
  let y = tableTop;

  const drawHeaders = (y) => {
    // Table header background
    doc.rect(colX[0], y, doc.page.width - colX[0] - doc.page.margins.right, 24)
       .fillAndStroke(COLORS.primary, COLORS.primary);
    
    // Header text
    doc.font('Helvetica-Bold')
       .fontSize(7)
       .fillColor(COLORS.white);
    
    columns.forEach((col, i) => {
      doc.text(col.label, colX[i] + 5, y + 8, {
        width: col.width - 10,
        align: col.align || 'left',
      });
    });
    
    doc.fillColor(COLORS.darkGray);
    return y + 24; // Return the new Y position
  };

  y = drawHeaders(y);

  for (let i = 0; i < dataArray.length; i++) {
    const row = { ...dataArray[i], __rowNumber: (i + 1).toString() };
    const rowHeights = columns.map(col =>
      doc.heightOfString(row[col.property] || '-', { 
        width: col.width - 10,
        align: col.align || 'left'
      })
    );
    const rowHeight = Math.max(...rowHeights) + 10; // More padding for readability

    // Add new page if needed
    if (y + rowHeight > maxY) {
      doc.addPage();
      
      // Add the continuation header on new pages
      drawContinuationHeader(doc, title, userInfo, generationDate);
      
      // Page numbers and user info will be added in the end callback
      
      y = 60; // Start further down on continuation pages
      y = drawHeaders(y);
    }

    // Alternating row colors
    if (i % 2 === 0) {
      doc.rect(colX[0], y, doc.page.width - colX[0] - doc.page.margins.right, rowHeight)
         .fill(COLORS.lightGray);
    }

    // Draw cells
    columns.forEach((col, j) => {
      const text = row[col.property] || '-';
      
      // Cell border
      doc.rect(colX[j], y, col.width, rowHeight)
         .strokeColor(COLORS.mediumGray)
         .lineWidth(0.5)
         .stroke();
      
      // Cell content
      doc.font('Helvetica')
         .fontSize(8)
         .fillColor(COLORS.darkGray)
         .text(text, colX[j] + 5, y + 5, {
           width: col.width - 10,
           align: col.align || 'left',
         });
    });

    y += rowHeight;
  }
  
  // Return the final Y position after the table
  return y;
}

module.exports = { buildPDF };