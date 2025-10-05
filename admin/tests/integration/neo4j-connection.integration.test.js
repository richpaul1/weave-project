// Simple Neo4j connection test
import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
const envPath = path.resolve(__dirname, '../../../.env.local');
dotenv.config({ path: envPath });

console.log('\n🔍 Testing Neo4j Connection...\n');
console.log('Configuration:');
console.log(`  URI: ${process.env.NEO4J_URI}`);
console.log(`  User: ${process.env.NEO4J_USER}`);
console.log(`  Password: ${'*'.repeat(process.env.NEO4J_PASSWORD?.length || 0)}`);
console.log(`  Database: ${process.env.NEO4J_DB_NAME}\n`);

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function testConnection() {
  let session;
  try {
    // Test 1: Verify driver connectivity
    console.log('Test 1: Verifying driver connectivity...');
    await driver.verifyConnectivity();
    console.log('✅ Driver connectivity verified\n');

    // Test 2: Create session with specific database
    console.log('Test 2: Creating session with database...');
    session = driver.session({ database: process.env.NEO4J_DB_NAME });
    console.log('✅ Session created\n');

    // Test 3: Run simple query
    console.log('Test 3: Running simple query...');
    const result = await session.run('RETURN 1 as num');
    const value = result.records[0].get('num');
    console.log(`✅ Query successful, returned: ${value}\n`);

    // Test 4: Check database info
    console.log('Test 4: Checking database info...');
    const dbResult = await session.run('CALL db.info()');
    const dbInfo = dbResult.records[0].toObject();
    console.log('✅ Database info:');
    console.log(`  Name: ${dbInfo.name}`);
    console.log(`  Creation Time: ${dbInfo.creationDate}\n`);

    // Test 5: List existing databases (requires system database access)
    console.log('Test 5: Listing all databases...');
    const systemSession = driver.session({ database: 'system' });
    try {
      const dbsResult = await systemSession.run('SHOW DATABASES');
      console.log('✅ Available databases:');
      dbsResult.records.forEach(record => {
        const name = record.get('name');
        const currentStatus = record.get('currentStatus');
        console.log(`  - ${name} (${currentStatus})`);
      });
    } catch (err) {
      console.log('⚠️  Could not list databases (may require admin privileges)');
    } finally {
      await systemSession.close();
    }

    console.log('\n✅ All tests passed! Neo4j connection is working correctly.\n');
    
  } catch (error) {
    console.error('\n❌ Connection test failed!\n');
    console.error('Error details:');
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}\n`);
    
    if (error.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('💡 Troubleshooting tips:');
      console.error('  1. Check that the username and password are correct');
      console.error('  2. Verify the user exists in Neo4j');
      console.error('  3. Make sure the user has access to the specified database');
      console.error('  4. Try connecting with the default "neo4j" user first\n');
      console.error('To create a new user in Neo4j, run:');
      console.error(`  CREATE USER ${process.env.NEO4J_USER} SET PASSWORD '${process.env.NEO4J_PASSWORD}'\n`);
      console.error('To create a new database, run:');
      console.error(`  CREATE DATABASE ${process.env.NEO4J_DB_NAME}\n`);
    }
    
    process.exit(1);
  } finally {
    if (session) {
      await session.close();
    }
    await driver.close();
  }
}

testConnection();
