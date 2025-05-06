const express = require('express');
const router = express.Router();
const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const AcademicStrand = require('../models/AcademicStrand');
const YearLevel = require('../models/YearLevel');

// @route   GET /api/dropdown/academic-years
router.get('/academic-years', async (req, res) => {
  try {
    const years = await AcademicYear.find({ status: "Active" });
    const options = years.map(year => ({
      value: year.Year,
      label: year.Year
    }));
    console.log("Academic years fetched:", options);
    res.json(options);
  } catch (err) {
    console.error("Error fetching academic years:", err);
    res.status(500).json({ error: "Failed to fetch academic years" });
  }
});

// @route   GET /api/dropdown/academic-terms
router.get('/academic-terms', async (req, res) => {
  try {
    const terms = await AcademicTerm.find({ status: "Active" });
    const options = terms.map(term => ({
      value: term.term,
      label: term.term
    }));
    console.log("Academic terms fetched:", options);
    res.json(options);
  } catch (err) {
    console.error("Error fetching academic terms:", err);
    res.status(500).json({ error: "Failed to fetch academic terms" });
  }
});

// @route   GET /api/dropdown/exam-dates
router.get('/exam-dates', async (req, res) => {
  try {
    const activeTerm = await AcademicTerm.findOne({ status: "Active" });
    if (!activeTerm) {
      return res.status(404).json({ error: "No active academic term found" });
    }

    const availableDates = activeTerm.examInterviewDates
      .filter(date => date.dateStatus === "Available")
      .map(date => ({
        date: date.date,
        maxCapacity: date.maxCapacity,
        currentCapacity: date.currentCapacity
      }));

    console.log("Available exam dates fetched:", availableDates);
    res.json(availableDates);
  } catch (err) {
    console.error("Error fetching exam dates:", err);
    res.status(500).json({ error: "Failed to fetch exam dates" });
  }
});

// @route   GET /api/dropdown/academic-strands
router.get('/academic-strands', async (req, res) => {
  try {
    const strands = await AcademicStrand.find({ status: "Active" });
    const options = strands.map(strand => ({
      value: strand.strand,
      label: strand.strand
    }));
    console.log("Academic strands fetched:", options);
    res.json(options);
  } catch (err) {
    console.error("Error fetching academic strands:", err);
    res.status(500).json({ error: "Failed to fetch academic strands" });
  }
});

// @route   GET /api/dropdown/year-levels
router.get('/year-levels', async (req, res) => {
  try {
    const levels = await YearLevel.find({ status: "Active" });
    const options = levels.map(level => ({
      value: level.level,
      label: level.level
    }));
    console.log("Year levels fetched:", options);
    res.json(options);
  } catch (err) {
    console.error("Error fetching year levels:", err);
    res.status(500).json({ error: "Failed to fetch year levels" });
  }
});

module.exports = router;