const express = require('express');
const router = express.Router();
const Roles = require('../models/Roles'); // Updated model

// FETCH role access 
// GET /api/admin/roles/:roleName
router.get('/:roleName', async (req, res) => {
    try {
        const role = await Roles.findOne({ role: req.params.roleName });

        if (!role) {
            return res.status(404).json({ message: 'Role not found.' });
        }

        res.status(200).json({ data: role });
    } catch (error) {
        console.error('Get role by name error:', error);
        res.status(500).json({ message: 'Server error retrieving role.' });
    }
});

// UPDATE role access
// PUT /api/admin/roles/:id
router.put('/:id', async (req, res) => {
    try {
        const updates = req.body;
        const { role, modules } = updates;

        // Check for duplicate role (excluding current role)
        const existing = await Roles.findOne({
            role,
            _id: { $ne: req.params.id }
        });

        if (existing) {
            return res.status(409).json({ message: 'Another role with the same name already exists.' });
        }

        const roleToUpdate = await Roles.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!roleToUpdate) {
            return res.status(404).json({ message: 'Role not found.' });
        }

        res.status(200).json({ message: 'Role updated successfully.', data: roleToUpdate });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ message: 'Server error updating role.' });
    }
});


// SAVE role access
// POST /api/admin/roles/save-access
router.post('/save-access', async (req, res) => {
    try {
        const { role, selectedModules } = req.body;

        // Check if the role exists in the database
        const existingRole = await Roles.findOne({ role });

        if (!existingRole) {
            // Role doesn't exist, so create a new role with default modules
            const newRole = new Roles({
                role,
                modules: selectedModules, // or you can populate it with a default set of modules
            });
            await newRole.save();
            return res.status(201).json({ message: 'Role created successfully', data: newRole });
        } else {
            // If role exists, update the modules
            existingRole.modules = selectedModules;
            await existingRole.save();
            return res.status(200).json({ message: 'Role access updated successfully', data: existingRole });
        }

    } catch (error) {
        console.error('Error saving role access:', error);
        res.status(500).json({ message: 'Server error saving role access.' });
    }
});


module.exports = router;
