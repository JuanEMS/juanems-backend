const express = require('express');
const router = express.Router();
const Strands = require('../models/Strands');

// CREATE strand
// POST /api/admin/strands/create-strand
router.post('/create-strand', async (req, res) => {
    try {
        const { strandCode, strandName, status } = req.body;

        // Check if strandCode or strandName already exists
        const existing = await Strands.findOne({
            $or: [{ strandCode }, { strandName }]
        });

        if (existing) {
            return res.status(409).json({ message: 'Strand code or name already exists.' });
        }

        const newStrand = new Strands({ strandCode, strandName, status });
        await newStrand.save();

        res.status(201).json({ message: 'Strand created successfully.', data: newStrand });
    } catch (error) {
        console.error('Create strand error:', error);
        res.status(500).json({ message: 'Server error creating strand.' });
    }
});

// GET all strands with optional archived filter
// GET /api/admin/strands or GET /api/admin/strands?archived=true
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
        
        const strands = await Strands.find(query).sort({ createdAt: -1 });
        
        console.log(`Found ${strands.length} strands matching query`);
        console.log(`Archives in response: ${strands.filter(item => item.isArchived).length}`);
        console.log(`Non-archives in response: ${strands.filter(item => !item.isArchived).length}`);
        
        res.status(200).json({ data: strands });
    } catch (error) {
        console.error('Get strands error:', error);
        res.status(500).json({ message: 'Server error fetching strands.' });
    }
});

// Archive/Unarchive strand
// PATCH /api/admin/strands/archive/:id
router.patch('/archive/:id', async (req, res) => {
    try {
        const { isArchived } = req.body; // Get the desired archive state from request body

        const strand = await Strands.findByIdAndUpdate(
            req.params.id,
            { isArchived },
            { new: true }
        );

        if (!strand) return res.status(404).json({ message: 'Strand not found' });

        res.json({
            message: `Strand ${isArchived ? 'archived' : 'unarchived'} successfully`,
            strand
        });
    } catch (err) {
        console.error(`Error ${req.body.isArchived ? 'archiving' : 'unarchiving'} strand:`, err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET single strand by ID
// GET /api/admin/strands/:id
router.get('/:id', async (req, res) => {
    try {
        const strand = await Strands.findById(req.params.id);

        if (!strand) {
            return res.status(404).json({ message: 'Strand not found.' });
        }

        res.status(200).json({ data: strand });
    } catch (error) {
        console.error('Get strand error:', error);
        res.status(500).json({ message: 'Server error retrieving strand.' });
    }
});

// UPDATE strand
// PUT /api/admin/strands/:id
router.put('/:id', async (req, res) => {
    try {
        const updates = req.body;
        const { strandCode, strandName } = updates;

        // Check for duplicate strandCode or strandName (excluding current)
        const existing = await Strands.findOne({
            $or: [{ strandCode }, { strandName }],
            _id: { $ne: req.params.id }
        });

        if (existing) {
            return res.status(409).json({ message: 'Another strand with the same code or name already exists.' });
        }

        const strand = await Strands.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!strand) {
            return res.status(404).json({ message: 'Strand not found.' });
        }

        res.status(200).json({ message: 'Strand updated successfully.', data: strand });
    } catch (error) {
        console.error('Update strand error:', error);
        res.status(500).json({ message: 'Server error updating strand.' });
    }
});

// DELETE strand
// DELETE /api/admin/strands/:id
router.delete('/:id', async (req, res) => {
    try {
        const strand = await Strands.findByIdAndDelete(req.params.id);

        if (!strand) {
            return res.status(404).json({ message: 'Strand not found.' });
        }

        res.status(200).json({ message: 'Strand deleted successfully.' });
    } catch (error) {
        console.error('Delete strand error:', error);
        res.status(500).json({ message: 'Server error deleting strand.' });
    }
});

module.exports = router;