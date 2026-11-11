/** Prints the winning plan of each hot query so you can confirm it uses an index (npm run db:explain). */
import { connectDB, disconnectDB } from '../src/config/db';
import { Doctor } from '../src/models';
import { hotQueries } from './lib/queries';
import { summarizePlan } from './lib/plan';

await connectDB();
const doctor = await Doctor.findOne().select('_id').lean();
if (!doctor) {
  console.error('No doctors found. Run `npm run seed` first.');
  process.exit(1);
}

let failures = 0;
for (const [name, run] of Object.entries(hotQueries(doctor._id))) {
  const plan = summarizePlan(await run());
  const ok = plan.usesIndex && !plan.collScan;
  if (!ok) failures++;
  const label = !ok ? 'SCAN' : plan.inMemorySort ? 'SORT' : 'OK  ';
  console.log(`${label}  ${name.padEnd(34)} ${plan.stages.join(' <- ')}  [${plan.indexes.join(', ')}]`);
}
console.log('\nOK = index scan, index order matches sort.  SORT = index used, small in-memory sort.  SCAN = full collection scan.');
await disconnectDB();
process.exit(failures ? 1 : 0);
