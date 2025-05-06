const express = require('express');
   const mongoose = require('mongoose');
   const cors = require('cors');
   const dotenv = require('dotenv');
   const taskRoutes = require('./routes/tasks');

   dotenv.config();

   const app = express();

   app.use(cors({
       origin: ['http://localhost:3000', 'https://juanems-web-frontend.onrender.com']
   }));
   app.use(express.json());

   app.use('/api/tasks', taskRoutes);

   mongoose.connect(process.env.MONGO_URI, {
       useNewUrlParser: true,
       useUnifiedTopology: true
   })
   .then(() => console.log('Connected to MongoDB :)'))
   .catch(err => console.error('MongoDB connection error:', err));

   const PORT = process.env.PORT || 5000;
   app.listen(PORT, () => console.log(`Server running on port ${PORT}`));