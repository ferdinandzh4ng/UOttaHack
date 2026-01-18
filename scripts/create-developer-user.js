import bcryptjs from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../server/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function createDeveloperUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uottahack';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get username and password from command line args or use defaults
    const username = process.argv[2] || 'developer';
    const password = process.argv[3] || 'developer123';

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log(`❌ User "${username}" already exists!`);
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Create user
    const user = new User({
      username,
      password: hashedPassword,
      role: 'developer',
      createdAt: new Date()
    });

    await user.save();

    console.log('✅ Developer user created successfully!');
    console.log('\n📋 User Details:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: developer`);
    console.log(`   ID: ${user._id}`);
    console.log('\n💡 You can now log in with these credentials');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating developer user:', error);
    process.exit(1);
  }
}

createDeveloperUser();

