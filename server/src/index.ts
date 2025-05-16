import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bestBallRoutes from './routes/bestBall';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', bestBallRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 