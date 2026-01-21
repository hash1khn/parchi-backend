import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function migrateJwtMetadata() {
    console.log('🚀 Starting JWT metadata migration...\n');

    try {
        // 1. Migrate all merchant users
        console.log('📦 Migrating merchant users...');
        const merchants = await prisma.merchants.findMany({
            select: { id: true, user_id: true },
        });

        console.log(`Found ${merchants.length} merchants to migrate`);

        let merchantSuccess = 0;
        let merchantFailed = 0;

        for (const merchant of merchants) {
            // Skip if user_id is null (shouldn't happen with the where filter, but TypeScript safety)
            if (!merchant.user_id) continue;

            try {
                const { error } = await adminSupabase.auth.admin.updateUserById(
                    merchant.user_id,
                    {
                        user_metadata: {
                            role: 'merchant_corporate',
                            merchant_id: merchant.id,
                        },
                    },
                );

                if (error) {
                    console.error(`  ❌ Failed for merchant ${merchant.id}:`, error.message);
                    merchantFailed++;
                } else {
                    merchantSuccess++;
                    if (merchantSuccess % 10 === 0) {
                        console.log(`  ✅ Migrated ${merchantSuccess} merchants...`);
                    }
                }
            } catch (error) {
                console.error(`  ❌ Error for merchant ${merchant.id}:`, error.message);
                merchantFailed++;
            }
        }

        console.log(`✅ Merchants: ${merchantSuccess} success, ${merchantFailed} failed\n`);

        // 2. Migrate all branch users
        console.log('🌿 Migrating branch users...');
        const branches = await prisma.merchant_branches.findMany({
            select: { id: true, user_id: true, merchant_id: true },
        });

        console.log(`Found ${branches.length} branches to migrate`);

        let branchSuccess = 0;
        let branchFailed = 0;

        for (const branch of branches) {
            // Skip if user_id is null (shouldn't happen with the where filter, but TypeScript safety)
            if (!branch.user_id) continue;

            try {
                const { error } = await adminSupabase.auth.admin.updateUserById(
                    branch.user_id,
                    {
                        user_metadata: {
                            role: 'merchant_branch',
                            branch_id: branch.id,
                            merchant_id: branch.merchant_id,
                        },
                    },
                );

                if (error) {
                    console.error(`  ❌ Failed for branch ${branch.id}:`, error.message);
                    branchFailed++;
                } else {
                    branchSuccess++;
                    if (branchSuccess % 10 === 0) {
                        console.log(`  ✅ Migrated ${branchSuccess} branches...`);
                    }
                }
            } catch (error) {
                console.error(`  ❌ Error for branch ${branch.id}:`, error.message);
                branchFailed++;
            }
        }

        console.log(`✅ Branches: ${branchSuccess} success, ${branchFailed} failed\n`);

        // 3. Summary
        console.log('📊 Migration Summary:');
        console.log(`  Total merchants: ${merchantSuccess}/${merchants.length}`);
        console.log(`  Total branches: ${branchSuccess}/${branches.length}`);
        console.log(`  Total migrated: ${merchantSuccess + branchSuccess}`);
        console.log(`  Total failed: ${merchantFailed + branchFailed}`);

        if (merchantFailed + branchFailed === 0) {
            console.log('\n🎉 Migration completed successfully!');
            console.log('👉 Existing users can now log out and log back in to get new JWT tokens with metadata.');
        } else {
            console.log('\n⚠️  Migration completed with some failures. Check errors above.');
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration
migrateJwtMetadata()
    .then(() => {
        console.log('\n✅ Script finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
