/**
 * Database seed script
 * Run this to populate the database with initial data
 */

import bcrypt from 'bcrypt';
import { getDb } from './index.js';

async function seed() {
  console.log('Seeding database...');

  const sql = getDb();

  try {
    // Check if admin user already exists
    const existing = await sql`
      SELECT id FROM users WHERE username = 'admin'
    `;

    if (existing.length > 0) {
      console.log('Admin user already exists, skipping seed');
      return;
    }

    // Create default admin user
    const passwordHash = await bcrypt.hash('admin123', 10);

    await sql`
      INSERT INTO users (username, password_hash, email, role)
      VALUES ('admin', ${passwordHash}, 'admin@network-gateway.local', 'admin')
    `;

    console.log('✓ Database seeded successfully');
    console.log('  Default user created:');
    console.log('    - admin / admin123 (admin role)');
  } catch (error) {
    console.error('✗ Seed failed:', error);
    throw error;
  }
}

// Run seed if called directly
if (import.meta.main) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
