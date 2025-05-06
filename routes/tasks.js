const express = require('express');
   const router = express.Router();
   const Task = require('../models/Task');

   router.get('/', async (req, res) => {
       try {
           const tasks = await Task.find();
           res.json(tasks);
       } catch (err) {
           res.status(500).json({ message: err.message });
       }
   });

   router.post('/', async (req, res) => {
       const task = new Task({
           title: req.body.title,
           description: req.body.description
       });
       try {
           const newTask = await task.save();
           res.status(201).json(newTask);
       } catch (err) {
           res.status(400).json({ message: err.message });
       }
   });

   router.put('/:id', async (req, res) => {
       try {
           const task = await Task.findById(req.params.id);
           if (!task) return res.status(404).json({ message: 'Task not found' });
           task.title = req.body.title || task.title;
           task.description = req.body.description || task.description;
           task.completed = req.body.completed !== undefined ? req.body.completed : task.completed;
           const updatedTask = await task.save();
           res.json(updatedTask);
       } catch (err) {
           res.status(400).json({ message: err.message });
       }
   });

   router.delete('/:id', async (req, res) => {
       try {
           const task = await Task.findByIdAndDelete(req.params.id);
           if (!task) return res.status(404).json({ message: 'Task not found' });
           res.json({ message: 'Task deleted' });
       } catch (err) {
           res.status(500).json({ message: err.message });
       }
   });

   module.exports = router;