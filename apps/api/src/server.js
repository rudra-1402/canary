import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './db/connection.js';

const port = process.env.PORT || 4000;

// Connect to MongoDB before serving — the DB-backed routes (e.g. /api/jobposts)
// would otherwise buffer queries and time out. Fail fast if the connection fails.
connectDB()
  .then(() => {
    const app = createApp();
    app.listen(port, () => {
      console.log(`API listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
