import crypto from 'crypto';
const scrypt = crypto.scrypt;
const randomBytes = crypto.randomBytes;
const password = '1234';
const salt = randomBytes(16).toString('hex');

scrypt(password, salt, 64, (err, buf) => {
  const hashedPassword = `${buf.toString('hex')}.${salt}`;
  console.log(hashedPassword);
});