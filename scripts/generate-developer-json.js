import bcryptjs from 'bcryptjs';

// Get username and password from command line args or use defaults
const username = process.argv[2] || 'developer';
const password = process.argv[3] || 'developer123';

// Hash the password
const hashedPassword = await bcryptjs.hash(password, 10);

// Generate the JSON document
const userDocument = {
  username: username,
  password: hashedPassword,
  role: 'developer',
  createdAt: new Date()
};

console.log('\n📋 MongoDB JSON Document:');
console.log(JSON.stringify(userDocument, null, 2));
console.log('\n💡 To insert into MongoDB:');
console.log('   db.users.insertOne(' + JSON.stringify(userDocument) + ')');
console.log('\n📝 Or use MongoDB Compass/Studio 3T to insert this document into the "users" collection');
console.log(`\n🔑 Login credentials:`);
console.log(`   Username: ${username}`);
console.log(`   Password: ${password}\n`);

