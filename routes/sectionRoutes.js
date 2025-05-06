const express = require('express');
const router = express.Router();
const Sections = require('../models/Sections');

// CREATE section
// POST /api/admin/sections/create-section
router.post('/create-section', async (req, res) => {
    try {
        const { sectionName, gradeLevel, strand, capacity, status } = req.body;

        // Check if section name already exists
        const existingSection = await Sections.findOne({ sectionName });

        if (existingSection) {
            return res.status(409).json({ message: 'Section with the same name already exists.' });
        }

        const newSection = new Sections({
            sectionName,
            gradeLevel,
            strand,
            capacity,
            status
        });

        await newSection.save();
        res.status(201).json({ message: 'Section created successfully.', data: newSection });
    } catch (error) {
        console.error('Create section error:', error);
        res.status(500).json({ message: 'Server error creating section.' });
    }
});

// GET all sections with optional archived filter
// GET /api/admin/sections or GET /api/admin/sections?archived=true
router.get('/', async (req, res) => {
    try {
        // Parse the archived parameter from the query string
        const showArchived = req.query.archived === 'true';
        console.log(`API received request with archived=${req.query.archived}, parsed to showArchived=${showArchived}`);
        
        let query = {};
        
        // Apply filtering based on archived parameter if it exists
        if (req.query.archived !== undefined) {
            query = { isArchived: showArchived };
            console.log('Applying filter by archive status:', query);
        }
        
        const sections = await Sections.find(query).sort({ createdAt: -1 });
        
        console.log(`Found ${sections.length} sections matching query`);
        console.log(`Archives in response: ${sections.filter(item => item.isArchived).length}`);
        console.log(`Non-archives in response: ${sections.filter(item => !item.isArchived).length}`);
        
        res.status(200).json({ data: sections });
    } catch (error) {
        console.error('Get sections error:', error);
        res.status(500).json({ message: 'Server error fetching sections.' });
    }
});

// Archive/Unarchive section
router.patch('/archive/:id', async (req, res) => {
    try {
        const { isArchived } = req.body; // Get the desired archive state from request body

        const section = await Sections.findByIdAndUpdate(
            req.params.id,
            { isArchived },
            { new: true }
        );

        if (!section) return res.status(404).json({ message: 'Section not found' });

        res.json({
            message: `Section ${isArchived ? 'archived' : 'unarchived'} successfully`,
            section
        });
    } catch (err) {
        console.error(`Error ${req.body.isArchived ? 'archiving' : 'unarchiving'} section:`, err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET single section by ID
// GET /api/admin/sections/:id
router.get('/:id', async (req, res) => {
    try {
        const section = await Sections.findById(req.params.id);
        if (!section) {
            return res.status(404).json({ message: 'Section not found.' });
        }
        res.status(200).json({ data: section });
    } catch (error) {
        console.error('Get section error:', error);
        res.status(500).json({ message: 'Server error retrieving section.' });
    }
});

// UPDATE section
// PUT /api/admin/sections/:id
router.put('/:id', async (req, res) => {
    try {
        const updates = req.body;
        const { sectionName } = updates;

        // Check if another section has the same name
        const existing = await Sections.findOne({ sectionName });

        if (existing && existing._id.toString() !== req.params.id) {
            return res.status(409).json({ message: 'Another section with the same name already exists.' });
        }

        const section = await Sections.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!section) {
            return res.status(404).json({ message: 'Section not found.' });
        }

        res.status(200).json({ message: 'Section updated successfully.', data: section });
    } catch (error) {
        console.error('Update section error:', error);
        res.status(500).json({ message: 'Server error updating section.' });
    }
});

// DELETE section
// DELETE /api/admin/sections/:id
router.delete('/:id', async (req, res) => {
    try {
        const section = await Sections.findByIdAndDelete(req.params.id);

        if (!section) {
            return res.status(404).json({ message: 'Section not found.' });
        }

        res.status(200).json({ message: 'Section deleted successfully.' });
    } catch (error) {
        console.error('Delete section error:', error);
        res.status(500).json({ message: 'Server error deleting section.' });
    }
});

module.exports = router;