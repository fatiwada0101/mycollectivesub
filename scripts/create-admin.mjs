import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../lib/supabase-server.js';
import { loginAdmin } from '../lib/admin-auth.js';

async function main() {
  const username = process.argv[2] || process.env.ADMIN_USERNAME;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs <username> <password>');
    process.exit(1);
  }

  const rounds = 12;

  console.log(`Hashing password for ${username}...`);
  const password_hash = await bcrypt.hash(password, rounds);

  const adminRecord = {
    username,
    password_hash,
    password,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.log('Upserting admin credentials to app_settings...');
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .upsert({
      key: 'super_admin',
      value: adminRecord,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    .select();

  if (error) {
    console.error('Failed to update app_settings:', error.message);
    process.exit(1);
  }

  console.log('Verifying admin login...');
  const testLogin = await loginAdmin(username, password, '127.0.0.1');

  if (!testLogin.success) {
    console.error('Verification failed:', testLogin.error);
    process.exit(1);
  }

  console.log(`✅ Admin account "${username}" successfully verified and active!`);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
