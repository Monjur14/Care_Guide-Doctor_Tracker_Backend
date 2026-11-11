/** Creates/updates indexes to match the schemas (run on deploy: npm run db:indexes). */
import { connectDB, disconnectDB } from '../src/config/db';
import { Doctor, Patient, User } from '../src/models';

await connectDB();
for (const model of [User, Doctor, Patient]) {
  const dropped = await model.syncIndexes();
  const indexes = await model.listIndexes();
  console.log(`${model.modelName}: ${indexes.map((i) => i.name).join(', ')}${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}`);
}
await disconnectDB();
